import { getCollection } from './db.js';

/**
 * Fetch daily attendance records for a specific date from MongoDB (or local mock database).
 * @param {string} date - Date in format YYYY-MM-DD
 * @returns {Promise<Array>} List of attendance records
 */
export async function fetchDailyAttendance(date) {
  if (!date) {
    throw new Error('Date parameter is required (format: YYYY-MM-DD)');
  }

  // Ensure format is valid
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }

  try {
    const attendanceCollection = getCollection('attendance');
    
    // Find all attendance records matching the exact date
    const records = await attendanceCollection.find({ date }).toArray();
    console.log(`[Database] Fetched ${records.length} attendance records for date: ${date}`);
    
    return records;
  } catch (error) {
    console.error(`[Database Error] Failed to fetch attendance for date ${date}:`, error.message);
    throw error;
  }
}
