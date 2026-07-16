import { connectDb, getCollection, convertId } from './db.js';
import { seedDatabase } from './seed.js';
import { scanAttendanceForDate } from './detector.js';

// We simulate calling the Express route handler logic directly for validation
async function resolveFlagMock(flagId, action, value) {
  const flagsCollection = getCollection('flagged_issues');
  const attendanceCollection = getCollection('attendance');
  const studentCollection = getCollection('students');

  const flags = await flagsCollection.find({ _id: convertId(flagId) }).toArray();
  const flag = flags[0];

  if (action === 'resolve_status') {
    const statusValue = value || 'Present';
    const students = await studentCollection.find({ studentId: flag.studentId }).toArray();
    const studentName = students[0].name;

    const newRecord = {
      studentId: flag.studentId,
      name: studentName,
      date: flag.date,
      status: statusValue,
      timestamp: new Date().toISOString(),
      whatsappStatus: 'Sent',
      whatsappSentAt: new Date().toISOString()
    };

    await attendanceCollection.insertOne(newRecord);
    await flagsCollection.updateOne({ _id: convertId(flagId) }, { 
      $set: { 
        status: 'Resolved',
        resolvedAt: new Date(),
        resolution: { action, value: statusValue, recordId: newRecord._id }
      } 
    });
    return `Created new '${statusValue}' attendance record for ${studentName}.`;
  } 
  
  if (action === 'keep_record') {
    const recordIdToKeep = value;
    const allRecords = await attendanceCollection.find({ studentId: flag.studentId, date: flag.date }).toArray();
    
    let deletedCount = 0;
    for (const record of allRecords) {
      if (record._id.toString() !== recordIdToKeep.toString()) {
        await attendanceCollection.deleteMany({ _id: record._id });
        deletedCount++;
      }
    }

    await attendanceCollection.updateOne(
      { _id: convertId(recordIdToKeep) },
      { 
        $set: { 
          whatsappStatus: 'Sent',
          whatsappSentAt: new Date().toISOString()
        } 
      }
    );

    await flagsCollection.updateOne({ _id: convertId(flagId) }, { 
      $set: { 
        status: 'Resolved',
        resolvedAt: new Date(),
        resolution: { action, keptRecordId: recordIdToKeep, deletedCount }
      } 
    });
    return `Kept record ${recordIdToKeep} and deleted ${deletedCount} duplicates.`;
  }
}

async function run() {
  console.log('--- Initializing database ---');
  await connectDb();

  console.log('\n--- Seeding database ---');
  await seedDatabase();

  const testDate = '2026-07-13';
  console.log(`\n--- Scanning ${testDate} attendance for anomalies ---`);
  await scanAttendanceForDate(testDate);

  const flagsCollection = getCollection('flagged_issues');
  const attendanceCollection = getCollection('attendance');

  const initialFlags = await flagsCollection.find({}).toArray();
  console.log(`\nFound ${initialFlags.length} flagged issues:`);
  initialFlags.forEach(f => {
    console.log(`- [${f.issueType.toUpperCase()}] Student: ${f.name} (${f.studentId})`);
    console.log(`  AI Recommendation: "${f.aiSuggestion.recommendedAction}"`);
    console.log(`  Explanation: "${f.aiSuggestion.explanation}"`);
  });

  // 1. Resolve Charlie Brown (missing entry)
  const charlieFlag = initialFlags.find(f => f.studentId === 'STU003');
  console.log(`\n--- Resolving Charlie Brown missing entry using AI suggestion ---`);
  console.log(`Suggested status: ${charlieFlag.aiSuggestion.suggestedStatus}`);
  
  const charlieResult = await resolveFlagMock(
    charlieFlag._id, 
    'resolve_status', 
    charlieFlag.aiSuggestion.suggestedStatus
  );
  console.log(`Result: ${charlieResult}`);

  // Verify Charlie's attendance record now exists
  const charlieRecords = await attendanceCollection.find({ studentId: 'STU003', date: testDate }).toArray();
  console.log(`Charlie Brown attendance logs for ${testDate}: ${charlieRecords.length} (Expected: 1)`);
  if (charlieRecords.length > 0) {
    console.log(`  - Status: ${charlieRecords[0].status}`);
  }

  // 2. Resolve Bob Johnson (duplicate entry)
  const bobFlag = initialFlags.find(f => f.studentId === 'STU002');
  console.log(`\n--- Resolving Bob Johnson duplicate entry using AI suggestion ---`);
  console.log(`Suggested record to keep ID: ${bobFlag.aiSuggestion.suggestedRecordId}`);
  
  const bobResult = await resolveFlagMock(
    bobFlag._id, 
    'keep_record', 
    bobFlag.aiSuggestion.suggestedRecordId
  );
  console.log(`Result: ${bobResult}`);

  // Verify Bob's attendance records now has exactly 1 entry
  const bobRecords = await attendanceCollection.find({ studentId: 'STU002', date: testDate }).toArray();
  console.log(`Bob Johnson attendance logs for ${testDate}: ${bobRecords.length} (Expected: 1)`);
  if (bobRecords.length > 0) {
    console.log(`  - Kept Record ID: ${bobRecords[0]._id}`);
    console.log(`  - Status: ${bobRecords[0].status}`);
    console.log(`  - Timestamp: ${bobRecords[0].timestamp}`);
  }

  // Final check of flag statuses
  const updatedFlags = await flagsCollection.find({}).toArray();
  console.log('\n--- Final Flags Status ---');
  updatedFlags.forEach(f => {
    console.log(`- Student: ${f.name} (${f.studentId}) | Status: ${f.status}`);
  });

  const allSuccess = 
    charlieRecords.length === 1 && 
    charlieRecords[0].status === 'Late' && // Because Charlie is typically Late (historical data: 1 record on 2026-07-12 was 'Late')
    bobRecords.length === 1 && 
    bobRecords[0]._id === bobFlag.aiSuggestion.suggestedRecordId &&
    updatedFlags.every(f => f.status === 'Resolved');

  if (allSuccess) {
    console.log('\nSUCCESS: Resolution & AI Suggestion engine validation passed!');
  } else {
    console.log('\nFAILURE: Resolution validation failed.');
  }
}

run().catch(err => {
  console.error('Test run failed:', err);
});
