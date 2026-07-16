import { connectDb, getCollection } from './db.js';
import { seedDatabase } from './seed.js';
import { scanAttendanceForDate } from './detector.js';

async function run() {
  console.log('--- Initializing database ---');
  await connectDb();

  console.log('\n--- Seeding test data ---');
  await seedDatabase();

  const testDate = '2026-07-13';
  console.log(`\n--- Running Core Anomaly Detector for ${testDate} ---`);
  
  const scanResult = await scanAttendanceForDate(testDate);
  console.log('Scan Result:', JSON.stringify(scanResult, null, 2));

  console.log('\n--- Retrieving Saved Flagged Issues from Database ---');
  const flagsCollection = getCollection('flagged_issues');
  const savedFlags = await flagsCollection.find({}).toArray();
  
  console.log('\nSaved Flags in Database:');
  console.log(JSON.stringify(savedFlags, null, 2));

  console.log('\n--- Verification Analysis ---');
  console.log(`Expected flags: 2. Actual saved flags: ${savedFlags.length}`);
  
  const duplicateFlags = savedFlags.filter(f => f.issueType === 'duplicate');
  console.log(`Duplicate flags found: ${duplicateFlags.length} (Expected: 1, Bob Johnson)`);
  if (duplicateFlags.length > 0) {
    console.log(`  - Student: ${duplicateFlags[0].name} (${duplicateFlags[0].studentId})`);
    console.log(`  - Details: ${duplicateFlags[0].details.message}`);
  }

  const missingFlags = savedFlags.filter(f => f.issueType === 'missing');
  console.log(`Missing flags found: ${missingFlags.length} (Expected: 1, Charlie Brown)`);
  if (missingFlags.length > 0) {
    console.log(`  - Student: ${missingFlags[0].name} (${missingFlags[0].studentId})`);
    console.log(`  - Details: ${missingFlags[0].details.message}`);
  }

  if (savedFlags.length === 2 && duplicateFlags.length === 1 && missingFlags.length === 1) {
    console.log('\nSUCCESS: Anomaly detection validation passed successfully!');
  } else {
    console.log('\nFAILURE: Anomaly detection validation failed.');
  }
}

run().catch(err => {
  console.error('Test run failed:', err);
});
