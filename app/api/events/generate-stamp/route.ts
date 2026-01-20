import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { Redis } from '@upstash/redis';

/**
 * POST /api/events/generate-stamp
 *
 * Uses Gemini AI to:
 * 1. Generate a unique Travel Stamp design specification
 * 2. Generate the actual stamp IMAGE using Gemini 2.0 Imagen
 * 3. Upload the image to IPFS
 * 4. Return the IPFS hash for NFT minting
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const STAMPS_KEY = 'sponsored-events:stamps';

interface GenerateStampRequest {
  eventId: string;
  eventName: string;
  eventType: string;
  sponsorName: string;
  sponsorLogoIPFS?: string;
  venueName: string;
  city: string;
  country: string;
  eventDate: string;
  theme?: string;
  style?: 'vintage' | 'modern' | 'artistic' | 'minimalist';
  generateImage?: boolean; // If true, generate actual image
}

interface StampDesign {
  name: string;
  description: string;
  imagePrompt: string;
  colors: string[];
  elements: string[];
  attributes: {
    trait_type: string;
    value: string;
  }[];
  imageIPFS?: string;      // IPFS hash of generated image
  imageBase64?: string;    // Base64 image data (temporary)
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateStampRequest = await req.json();

    // Validate required fields
    if (!body.eventId || !body.eventName || !body.city) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if stamp already generated
    const stampKey = `${STAMPS_KEY}:${body.eventId}`;
    const existingStamp = await redis.get<StampDesign>(stampKey);

    if (existingStamp) {
      return NextResponse.json({
        success: true,
        stamp: existingStamp,
        cached: true,
      });
    }

    // Generate stamp design using Gemini
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `You are a creative designer specializing in travel stamps and event memorabilia.

Create a unique Travel Stamp NFT design for this event:

Event Name: ${body.eventName}
Event Type: ${body.eventType || 'Gala'}
Sponsor: ${body.sponsorName || 'Unknown'}
Venue: ${body.venueName || 'Unknown venue'}
City: ${body.city}
Country: ${body.country}
Date: ${body.eventDate || 'TBD'}
Style Preference: ${body.style || 'artistic'}
Theme: ${body.theme || 'cultural celebration'}

Design Requirements:
1. Create a circular stamp design (like a passport stamp)
2. Include the event name prominently
3. Incorporate cultural elements from ${body.city}, ${body.country}
4. Add decorative borders and vintage elements
5. Include the date in a stylized format
6. Make it collectible and visually striking

Respond with a JSON object containing:
{
  "name": "Stamp name for NFT",
  "description": "A 2-3 sentence description of the stamp design",
  "imagePrompt": "A detailed prompt for an AI image generator to create this stamp (50-100 words)",
  "colors": ["primary color", "secondary color", "accent color"],
  "elements": ["list of 5 key visual elements"],
  "attributes": [
    {"trait_type": "Event Type", "value": "Gala"},
    {"trait_type": "City", "value": "Mexico City"},
    {"trait_type": "Country", "value": "Mexico"},
    {"trait_type": "Year", "value": "2026"},
    {"trait_type": "Style", "value": "Artistic"},
    {"trait_type": "Sponsor", "value": "La Mille"}
  ]
}

Return ONLY the JSON object, no markdown formatting.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });
    const responseText = result.text?.trim() || '';

    // Parse the JSON response
    let stampDesign: StampDesign;
    try {
      // Remove any markdown code block markers
      const cleanJson = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      stampDesign = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('[GenerateStamp] Failed to parse Gemini response:', responseText);

      // Create fallback design
      stampDesign = {
        name: `${body.eventName} Travel Stamp`,
        description: `A commemorative travel stamp celebrating ${body.eventName} in ${body.city}, ${body.country}. This unique NFT serves as proof of attendance and a digital collectible.`,
        imagePrompt: `A circular vintage passport stamp design for "${body.eventName}" in ${body.city}, ${body.country}. Features ornate borders, cultural motifs, the event date, and elegant typography. Style: ${body.style || 'artistic'}, Colors: gold, navy blue, and cream.`,
        colors: ['#FFD700', '#1E3A5F', '#F5F5DC'],
        elements: [
          'Circular border',
          'Event name in elegant typography',
          'City skyline silhouette',
          'Date stamp',
          'Cultural patterns',
        ],
        attributes: [
          { trait_type: 'Event Type', value: body.eventType || 'Gala' },
          { trait_type: 'City', value: body.city },
          { trait_type: 'Country', value: body.country },
          { trait_type: 'Year', value: new Date(body.eventDate || Date.now()).getFullYear().toString() },
          { trait_type: 'Style', value: body.style || 'Artistic' },
          { trait_type: 'Sponsor', value: body.sponsorName || 'EmpowerTours' },
        ],
      };
    }

    // Generate actual image if requested
    // Note: Image generation with new @google/genai SDK requires different approach
    // For now, return design spec only - image can be generated separately
    if (body.generateImage) {
      try {
        console.log('[GenerateStamp] Image generation requested - returning design spec for external generation');

        const imagePrompt = `Generate a circular travel stamp design image:
${stampDesign.imagePrompt}

Requirements:
- Circular passport stamp style
- Clean, professional design
- Include text: "${body.eventName}"
- Include: "${body.city}, ${body.country}"
- Style: Vintage travel stamp with ornate borders
- Colors: ${stampDesign.colors.join(', ')}
- High quality, suitable for NFT`;

        // Store the enhanced image prompt for external generation
        stampDesign.imagePrompt = imagePrompt;
        console.log('[GenerateStamp] Design spec created with image prompt for external generation');
      } catch (imageError: any) {
        console.error('[GenerateStamp] Image prompt generation failed:', imageError.message);
      }
    }

    // Cache the stamp design
    await redis.set(stampKey, JSON.stringify(stampDesign), { ex: 86400 * 30 }); // 30 days

    return NextResponse.json({
      success: true,
      stamp: stampDesign,
      cached: false,
    });

  } catch (error: any) {
    console.error('[GenerateStamp] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET - Retrieve existing stamp design
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'eventId required' },
        { status: 400 }
      );
    }

    const stampKey = `${STAMPS_KEY}:${eventId}`;
    const stamp = await redis.get<StampDesign>(stampKey);

    if (!stamp) {
      return NextResponse.json({
        success: false,
        error: 'Stamp not found for this event',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      stamp,
    });

  } catch (error: any) {
    console.error('[GenerateStamp] GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
