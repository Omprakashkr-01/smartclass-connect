import { getCollection } from './db.js';
import { fetchDailyAttendance } from './attendanceService.js';
import { generateSuggestionForFlag } from './ai_engine.js';
import { config } from './config.js';

/**
 * Uses OpenAI GPT-3.5 to analyze rosters and logs to identify anomalies.
 */
async function scanWithAI(date, students, records) {
  const apiKey = config.openaiApiKey;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OpenAI API Key is not set or is placeholder');
  }

  const rosterStr = students.map(s => `ID: ${s.studentId}, Name: ${s.name}, Grade: ${s.grade}`).join('\n');
  const logsStr = records.map(r => `RecordID: ${r._id}, StudentID: ${r.studentId}, Name: ${r.name}, Status: ${r.status}, Time: ${r.timestamp}`).join('\n');

  const systemMessage = `You are an expert AI school attendance auditor. Analyze the student roster and the attendance logs for the date ${date}. Identify any attendance anomalies, and generate intelligent suggestions.

Anomalies to look for:
1. "missing": Student is on the roster but has no check-in record for this date.
2. "duplicate": Student has multiple check-in records for this date.

For each anomaly, recommend an action.
- For "missing" issues, the options should be to mark them with a status (Present, Absent, Late) or clarify. E.g.
  { "label": "Mark Present", "action": "resolve_status", "value": "Present" }
- For "duplicate" issues, the options should be to keep a specific record ID or delete all. E.g.
  { "label": "Keep Earliest Record", "action": "keep_record", "value": "<earliest_record_id>" }

Respond strictly with a JSON object containing an "anomalies" array. Follow this schema exactly:
{
  "anomalies": [
    {
      "studentId": "STU001",
      "name": "Alice Smith",
      "issueType": "missing" | "duplicate",
      "details": {
        "message": "Detailed description of the issue"
      },
      "aiSuggestion": {
        "suggestedStatus": "Present" | "Absent" | "Late" | null,
        "recommendedAction": "Short recommended action string",
        "explanation": "Brief explanation of the suggestion",
        "options": [
          { "label": "Option Button Label", "action": "resolve_status" | "keep_record" | "delete_all" | "clarify", "value": "status_value_or_record_id_or_null" }
        ]
      }
    }
  ]
}`;

  const userMessage = `Date: ${date}\n\nStudent Roster:\n${rosterStr}\n\nDaily Attendance Logs:\n${logsStr}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);
  
  // Format dates and ensure structure matches
  const anomalies = (parsed.anomalies || []).map(a => ({
    ...a,
    date,
    status: 'Pending',
    createdAt: new Date()
  }));

  return anomalies;
}

/**
 * Scans attendance records for a specific date to identify missing or duplicate entries,
 * and saves any found anomalies in the flagged_issues collection.
 * 
 * @param {string} date - Date in format YYYY-MM-DD
 * @returns {Promise<Object>} Summary of the scan results
 */
export async function scanAttendanceForDate(date) {
  if (!date) {
    throw new Error('Date parameter is required for scanning.');
  }

  const studentCollection = getCollection('students');
  const flagsCollection = getCollection('flagged_issues');

  // 1. Fetch all enrolled students
  const students = await studentCollection.find({}).toArray();
  if (students.length === 0) {
    console.log('[Detector] No enrolled students found. Skipping scan.');
    return { date, scannedCount: 0, anomaliesFound: 0, message: 'No students found' };
  }

  // 2. Fetch attendance records for this date
  const records = await fetchDailyAttendance(date);

  let anomalies = [];
  let usedAI = false;

  const apiKey = config.openaiApiKey;
  if (apiKey && apiKey !== 'your_openai_api_key_here') {
    try {
      console.log(`[Detector] Running OpenAI GPT-3.5 AI Anomaly Scan for date: ${date}...`);
      anomalies = await scanWithAI(date, students, records);
      usedAI = true;
      console.log(`[Detector] OpenAI GPT-3.5 Scan complete. Found ${anomalies.length} anomalies.`);
    } catch (err) {
      console.warn('[Detector] OpenAI anomaly scan failed, falling back to rule-based: ', err.message);
    }
  }

  if (!usedAI) {
    console.log(`[Detector] Running rule-based anomaly scan for date: ${date}...`);
    // Map students by ID for easy lookup
    const studentMap = new Map(students.map(s => [s.studentId, s]));
    
    // Group attendance records by student ID
    const attendanceGroups = new Map();
    for (const record of records) {
      if (!attendanceGroups.has(record.studentId)) {
        attendanceGroups.set(record.studentId, []);
      }
      attendanceGroups.get(record.studentId).push(record);
    }

    // Check for duplicates and missing entries
    for (const student of students) {
      const studentRecords = attendanceGroups.get(student.studentId) || [];

      if (studentRecords.length === 0) {
        // Scenario A: Missing Entry
        anomalies.push({
          studentId: student.studentId,
          name: student.name,
          date,
          issueType: 'missing',
          details: {
            message: `${student.name} is enrolled but has no attendance log for ${date}.`
          },
          status: 'Pending',
          aiSuggestion: null,
          createdAt: new Date()
        });
      } else if (studentRecords.length > 1) {
        // Scenario B: Duplicate Entries
        anomalies.push({
          studentId: student.studentId,
          name: student.name,
          date,
          issueType: 'duplicate',
          details: {
            message: `${student.name} has ${studentRecords.length} duplicate check-in logs.`,
            records: studentRecords.map(r => ({
              _id: r._id,
              status: r.status,
              timestamp: r.timestamp
            }))
          },
          status: 'Pending',
          aiSuggestion: null,
          createdAt: new Date()
        });
      }
    }

    // Generate suggestions for each anomaly locally
    for (const anomaly of anomalies) {
      anomaly.aiSuggestion = await generateSuggestionForFlag(anomaly);
    }
  }

  // 3. Save found anomalies into flagged_issues collection (avoiding duplicates if scanned twice)
  let savedCount = 0;
  for (const anomaly of anomalies) {
    // Check if this anomaly is already logged for this student and date
    const existing = await flagsCollection.find({
      studentId: anomaly.studentId,
      date: anomaly.date,
      issueType: anomaly.issueType
    }).toArray();

    if (existing.length === 0) {
      await flagsCollection.insertOne(anomaly);
      savedCount++;
    }
  }

  console.log(`[Detector] Scan complete for ${date}. Found ${anomalies.length} anomalies. Saved ${savedCount} new flags.`);

  return {
    date,
    scannedStudentsCount: students.length,
    anomaliesCount: anomalies.length,
    newFlagsSaved: savedCount,
    anomalies: anomalies.map(a => ({
      studentId: a.studentId,
      name: a.name,
      issueType: a.issueType
    }))
  };
}
