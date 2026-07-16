import { connectDb, getCollection } from './db.js';

const mockStudents = [
  { studentId: 'STU001', name: 'Alice Smith', grade: '10th Grade', email: 'alice@school.edu', parentPhone: '+1 (555) 019-2834' },
  { studentId: 'STU002', name: 'Bob Johnson', grade: '10th Grade', email: 'bob@school.edu', parentPhone: '+1 (555) 014-9821' },
  { studentId: 'STU003', name: 'Charlie Brown', grade: '10th Grade', email: 'charlie@school.edu', parentPhone: '+1 (555) 017-3849' },
  { studentId: 'STU004', name: 'David Miller', grade: '10th Grade', email: 'david@school.edu', parentPhone: '+1 (555) 012-7743' },
  { studentId: 'STU005', name: 'Eve Davis', grade: '10th Grade', email: 'eve@school.edu', parentPhone: '+1 (555) 015-8832' }
];

const mockAttendance = [
  // --- Attendance for 2026-07-12 (Clean Day - All present/late, no issues) ---
  { studentId: 'STU001', name: 'Alice Smith', date: '2026-07-12', status: 'Present', timestamp: '2026-07-12T08:15:00Z', whatsappStatus: 'Sent', whatsappSentAt: '2026-07-12T08:17:00Z' },
  { studentId: 'STU002', name: 'Bob Johnson', date: '2026-07-12', status: 'Present', timestamp: '2026-07-12T08:20:00Z', whatsappStatus: 'Sent', whatsappSentAt: '2026-07-12T08:22:00Z' },
  { studentId: 'STU003', name: 'Charlie Brown', date: '2026-07-12', status: 'Late', timestamp: '2026-07-12T08:45:00Z', whatsappStatus: 'Sent', whatsappSentAt: '2026-07-12T08:47:00Z' },
  { studentId: 'STU004', name: 'David Miller', date: '2026-07-12', status: 'Present', timestamp: '2026-07-12T08:10:00Z', whatsappStatus: 'Sent', whatsappSentAt: '2026-07-12T08:12:00Z' },
  { studentId: 'STU005', name: 'Eve Davis', date: '2026-07-12', status: 'Present', timestamp: '2026-07-12T08:12:00Z', whatsappStatus: 'Sent', whatsappSentAt: '2026-07-12T08:13:00Z' },

  // --- Attendance for 2026-07-13 (Reconciliation Day - Inconsistencies engineered!) ---
  { studentId: 'STU001', name: 'Alice Smith', date: '2026-07-13', status: 'Present', timestamp: '2026-07-13T08:14:00Z', whatsappStatus: 'Not Sent' },
  { studentId: 'STU002', name: 'Bob Johnson', date: '2026-07-13', status: 'Present', timestamp: '2026-07-13T08:22:00Z', whatsappStatus: 'Not Sent' },
  { studentId: 'STU002', name: 'Bob Johnson', date: '2026-07-13', status: 'Present', timestamp: '2026-07-13T08:25:00Z', whatsappStatus: 'Not Sent' },
  { studentId: 'STU004', name: 'David Miller', date: '2026-07-13', status: 'Present', timestamp: '2026-07-13T08:08:00Z', whatsappStatus: 'Not Sent' },
  { studentId: 'STU005', name: 'Eve Davis', date: '2026-07-13', status: 'Late', timestamp: '2026-07-13T08:50:00Z', whatsappStatus: 'Not Sent' }
];

export async function seedDatabase() {
  await connectDb();
  
  const studentCollection = getCollection('students');
  const attendanceCollection = getCollection('attendance');
  const flagsCollection = getCollection('flagged_issues');

  // Clear existing collections
  console.log('Clearing old database records...');
  await studentCollection.deleteMany({});
  await attendanceCollection.deleteMany({});
  await flagsCollection.deleteMany({});

  // Insert seed data
  console.log(`Seeding ${mockStudents.length} students...`);
  await studentCollection.insertMany(mockStudents);

  console.log(`Seeding ${mockAttendance.length} attendance records...`);
  await attendanceCollection.insertMany(mockAttendance);

  console.log('Database successfully seeded with mock data!');
}

// If run directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
