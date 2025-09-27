const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testGemini() {
  if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY is not set in .env.local');
    return;
  }

  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
      {
        contents: [
          {
            parts: [
              { text: 'Generate a short travel itinerary description for Paris.' }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    console.log('Gemini Response:', response.data.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error(
      'Error calling Gemini API:',
      error.response ? error.response.data : error.message
    );
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

testGemini();

