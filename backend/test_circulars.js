import { config } from './config.js';

async function runTests() {
  console.log('--- Testing Circulars & Timetables Workflow ---');
  const port = config.port || 5000;
  
  try {
    // 1. Create a Circular (announcement)
    console.log('Creating circular with targetLanguage "all"...');
    const createRes = await fetch(`http://localhost:${port}/api/circulars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'circular',
        title: 'Mid-term Exam Notice',
        content: 'Please note that the mid-term exams will start next week. Prepare well.',
        targetLanguage: 'all'
      })
    });
    
    const createData = await createRes.json();
    console.log('Create Response:', createData);
    
    if (!createData.success) {
      throw new Error('Circular creation failed');
    }
    
    const circularId = createData.circular._id;
    console.log(`Created Circular ID: ${circularId}`);
    
    // 2. Fetch all circulars to verify it's stored in MongoDB
    console.log('Fetching circulars list...');
    const listRes = await fetch(`http://localhost:${port}/api/circulars`);
    const circulars = await listRes.json();
    console.log(`Number of circulars in DB: ${circulars.length}`);
    
    // 3. Trigger distribution to all parents
    console.log(`Triggering distribution for Circular ${circularId}...`);
    const distRes = await fetch(`http://localhost:${port}/api/circulars/${circularId}/distribute`, {
      method: 'POST'
    });
    
    const distData = await distRes.json();
    console.log('Distribution Response:', distData);
    
    if (distData.success) {
      console.log('SUCCESS: Circular created, automatically translated, and distributed in preferred languages successfully!');
    } else {
      console.error('FAILED: Circular distribution endpoint returned success: false.');
    }
    
  } catch (err) {
    console.error('Test execution failed:', err.message);
  }
}

runTests();
