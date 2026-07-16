import { config } from './config.js';

/**
 * Translates text into the target language using OpenAI's GPT-3.5 API.
 * Falls back to basic mock behavior if no API key is provided.
 * 
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language (e.g. 'hi' for Hindi, 'bho' for Bhojpuri)
 * @returns {Promise<string>} Translated text
 */
export async function translateText(text, targetLanguage) {
  const apiKey = config.openaiApiKey;
  
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.warn('[Translation Service] OpenAI API Key is missing. Using fallback mock translation.');
    return `[Mock Translation to ${targetLanguage}]: ${text}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an expert translator. Translate the user's input text into the target language. Respond ONLY with the direct translation, preserving any variables (like placeholders, student names, phone numbers) exactly as they are. Do not add explanations or conversational filler.`
          },
          {
            role: 'user',
            content: `Translate to: "${targetLanguage}"\n\nText: "${text}"`
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    
    // Clean outer quotes if any returned by LLM
    if (translatedText.startsWith('"') && translatedText.endsWith('"')) {
      return translatedText.slice(1, -1);
    }
    return translatedText;
  } catch (error) {
    console.error('[Translation Service] OpenAI translation error:', error.message);
    throw error;
  }
}
