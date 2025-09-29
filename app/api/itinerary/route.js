import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { saveItinerary } from '@/lib/storage';

export async function POST(request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const result = await model.generateContent(prompt, { signal: controller.signal });
    clearTimeout(timeoutId);

    const itinerary = result.response.text();
    await saveItinerary(prompt, itinerary);
    return NextResponse.json({ itinerary });
  } catch (error) {
    console.error('Itinerary API Error:', error);
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 });
  }
}
