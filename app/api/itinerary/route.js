import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { saveItineraryDraft } from '@/lib/storage';

export async function POST(request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    }, { signal: controller.signal });
    clearTimeout(timeoutId);

    const itinerary = result.text || '';
    saveItineraryDraft(Date.now().toString(), { prompt, itinerary });
    return NextResponse.json({ itinerary });
  } catch (error) {
    console.error('Itinerary API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate itinerary' }, { status: 500 });
  }
}
