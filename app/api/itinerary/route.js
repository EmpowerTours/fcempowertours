import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    try {
        const { prompt } = await req.json();
        const response = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
            {
                contents: [
                    {
                        parts: [
                            { text: prompt || 'Generate a short travel itinerary description for Paris.' }
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
        return NextResponse.json({ itinerary: response.data.candidates[0].content.parts[0].text });
    } catch (error) {
        return NextResponse.json(
            { error: error.response ? error.response.data : error.message },
            { status: error.response ? error.response.status : 500 }
        );
    }
}
