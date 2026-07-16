import { getCollection } from './db.js';

/**
 * Generates an intelligent suggestion for a flagged attendance issue.
 * 
 * @param {Object} flag - The flagged issue document
 * @returns {Promise<Object>} AI suggestion object containing recommendation, explanation, and action options
 */
export async function generateSuggestionForFlag(flag) {
  const attendanceCollection = getCollection('attendance');
  const studentId = flag.studentId;
  const date = flag.date;

  if (flag.issueType === 'missing') {
    try {
      // Look up student's past attendance history (excluding current scan date)
      const allHistory = await attendanceCollection.find({ studentId }).toArray();
      const history = allHistory.filter(record => record.date !== date);

      if (history.length > 0) {
        // Count statuses to find the most frequent one
        const statusCounts = {};
        for (const record of history) {
          statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
        }

        let typicalStatus = 'Present';
        let maxCount = 0;
        for (const status in statusCounts) {
          if (statusCounts[status] > maxCount) {
            maxCount = statusCounts[status];
            typicalStatus = status;
          }
        }

        const frequencyPct = Math.round((maxCount / history.length) * 100);

        return {
          suggestedStatus: typicalStatus,
          recommendedAction: `Mark as ${typicalStatus}`,
          explanation: `Student is typically '${typicalStatus}' (${frequencyPct}% of the time based on ${history.length} historical records). Suggest marking them '${typicalStatus}' for this day.`,
          options: [
            { label: `Mark ${typicalStatus}`, action: 'resolve_status', value: typicalStatus },
            { label: 'Mark Absent', action: 'resolve_status', value: 'Absent' },
            { label: 'Request Clarification', action: 'clarify', value: null }
          ]
        };
      }
    } catch (err) {
      console.warn('Error reading history for AI suggestion, using default:', err.message);
    }

    // Default recommendation if no history exists
    return {
      suggestedStatus: null,
      recommendedAction: 'Request Clarification',
      explanation: 'No prior attendance records found for this student. Clarify status with parent or class teacher.',
      options: [
        { label: 'Request Clarification', action: 'clarify', value: null },
        { label: 'Mark Present', action: 'resolve_status', value: 'Present' },
        { label: 'Mark Absent', action: 'resolve_status', value: 'Absent' }
      ]
    };
  } 
  
  if (flag.issueType === 'duplicate') {
    const records = flag.details?.records || [];
    if (records.length > 0) {
      // Find the earliest record
      const sortedRecords = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const earliestRecord = sortedRecords[0];
      
      // Format time
      const timeStr = new Date(earliestRecord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return {
        suggestedRecordId: earliestRecord._id,
        recommendedAction: 'Keep Earliest Log',
        explanation: `Detected duplicate check-ins in close succession. Recommend keeping the earliest check-in record at ${timeStr} (${earliestRecord.status}) and removing the others.`,
        options: [
          { label: 'Keep Earliest Record', action: 'keep_record', value: earliestRecord._id },
          { label: 'Keep Latest Record', action: 'keep_record', value: sortedRecords[sortedRecords.length - 1]._id },
          { label: 'Remove All Check-ins', action: 'delete_all', value: null }
        ]
      };
    }
  }

  // Fallback
  return {
    suggestedStatus: null,
    recommendedAction: 'Manual Review Required',
    explanation: 'Unable to auto-resolve. Please inspect records manually.',
    options: [
      { label: 'Keep Records as is', action: 'ignore', value: null }
    ]
  };
}
