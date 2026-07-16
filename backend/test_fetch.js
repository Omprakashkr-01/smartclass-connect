import { connectDb } from './db.js';
import { fetchDailyAttendance } from './attendanceService.js';
import { seedDatabase } from './seed.js';

async function run() {
  console.log('--- Initializing database connection ---');
  await connectDb();

  console.log('\n--- Seeding test data ---');
  await seedDatabase();

  const testDate = '2026-07-13';
  console.log(`\n--- Fetching daily attendance records for ${testDate} ---`);
  
  const records = await fetchDailyAttendance(testDate);
  console.log('\nFetched records:');
  console.log(JSON.stringify(records, null, 2));

  console.log('\nVerification details:');
  console.log(`Total records: ${records.length}`);
  const bobRecords = records.filter(r => r.studentId === 'STU002');
  console.log(`Bob Johnson check-ins (STU002): ${bobRecords.length} (Expected: 2, Duplicate entry)`);
  const aliceRecords = records.filter(r => r.studentId === 'STU001');
  console.log(`Alice Smith check-ins (STU001): ${aliceRecords.length} (Expected: 1, Normal)`);
  const charlieRecords = records.filter(r => r.studentId === 'STU003');
  console.log(`Charlie Brown check-ins (STU003): ${charlieRecords.length} (Expected: 0, Missing entry)`);
}

run().catch(err => {
  console.error('Test run failed:', err);
});
