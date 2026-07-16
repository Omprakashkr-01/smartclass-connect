import { getCollection } from './db.js';
import { fetchDailyAttendance } from './attendanceService.js';
import { generateSuggestionForFlag } from './ai_engine.js';

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

  const anomalies = [];

  // 3. Check for duplicates and missing entries
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

  // Generate AI suggestions for each anomaly
  for (const anomaly of anomalies) {
    anomaly.aiSuggestion = await generateSuggestionForFlag(anomaly);
  }

  // 4. Save found anomalies into flagged_issues collection (avoiding duplicates if scanned twice)
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
