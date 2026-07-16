import { translateText } from './translationService.js';
import { config } from './config.js';

async function runTests() {
  console.log('--- Testing Translation Service ---');
  
  // 1. Test Mock Translation (without API key)
  try {
    const text = 'Hello, how are you?';
    const target = 'hi';
    console.log(`Translating "${text}" to "${target}" (no key mock fallback)...`);
    const result = await translateText(text, target);
    console.log('Result:', result);
    if (result.includes('[Mock Translation to hi]')) {
      console.log('SUCCESS: Mock translation fallback works correctly.');
    } else {
      console.error('FAILED: Mock translation fallback did not return expected mock format.');
    }
  } catch (err) {
    console.error('Mock test failed:', err);
  }

  // 2. Test HTTP API Request to /api/translate endpoint
  try {
    console.log('\n--- Testing POST /api/translate endpoint ---');
    const port = config.port || 5000;
    const response = await fetch(`http://localhost:${port}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Attendance scan complete',
        targetLanguage: 'bho'
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', data);
    
    if (response.status === 200 && data.translated) {
      console.log('SUCCESS: /api/translate endpoint returned successful translation!');
    } else {
      console.error('FAILED: /api/translate endpoint returned error status or missing translation.');
    }
  } catch (err) {
    console.error('Endpoint test failed. Make sure the backend server is running:', err.message);
  }
}

runTests();
