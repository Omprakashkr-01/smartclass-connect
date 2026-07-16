import { config } from './config.js';

async function runTests() {
  console.log('--- Testing Parent Language Preference Notifications ---');
  const port = config.port || 5000;
  
  // We will fetch the students first to verify Bob Johnson has parentLanguage: hi
  try {
    const studentsRes = await fetch(`http://localhost:${port}/api/students`);
    const students = await studentsRes.json();
    const bob = students.find(s => s.name === 'Bob Johnson');
    console.log('Student Bob Johnson parentLanguage in DB:', bob ? bob.parentLanguage : 'Not Found');
    
    // Now trigger simulated WhatsApp send for Bob Johnson (which uses parentLanguage: hi)
    // Find Bob's attendance log for 2026-07-13
    const attRes = await fetch(`http://localhost:${port}/api/attendance?date=2026-07-13`);
    const logs = await attRes.json();
    const bobLog = logs.find(l => l.name === 'Bob Johnson');
    
    if (bobLog) {
      console.log(`Sending WhatsApp to Bob Johnson (Log ID: ${bobLog._id})...`);
      const waRes = await fetch(`http://localhost:${port}/api/attendance/${bobLog._id}/whatsapp`, {
        method: 'POST'
      });
      const waData = await waRes.json();
      console.log('WhatsApp Send Response:', waData);
      
      if (waData.success) {
        console.log('SUCCESS: Parent preferred language queried and notification simulated successfully.');
      } else {
        console.error('FAILED: WhatsApp endpoint returned success: false.');
      }
    } else {
      console.error('FAILED: Bob Johnson attendance log not found for date 2026-07-13.');
    }
  } catch (err) {
    console.error('Test execution failed:', err.message);
  }
}

runTests();
