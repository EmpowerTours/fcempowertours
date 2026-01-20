import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

/**
 * POST /api/oracle/generate-experience-stamp
 *
 * AI-Powered Experience Stamp Generator using Gemini (Nano Banana)
 *
 * Flow:
 * 1. Analyze creator's photos to extract visual themes
 * 2. Combine with location data and experience type
 * 3. Generate unique EmpowerTours branded stamp image
 * 4. Upload to IPFS
 * 5. Return IPFS hash for blockchain storage
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

interface GenerateStampRequest {
  locationName: string;
  city: string;
  country: string;
  experienceType?: 'food' | 'attraction' | 'hotel' | 'entertainment' | 'nature' | 'shopping' | 'other';
  description?: string;
  creatorUsername?: string;
  photos?: string[]; // IPFS hashes or URLs of creator's photos
  style?: 'vintage' | 'modern' | 'artistic' | 'minimalist' | 'playful';
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateStampRequest = await req.json();

    // Validate required fields
    if (!body.locationName || !body.city || !body.country) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: locationName, city, country' },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    console.log('[GenerateExperienceStamp] Creating stamp for:', {
      location: body.locationName,
      city: body.city,
      country: body.country,
      type: body.experienceType,
      hasPhotos: body.photos?.length || 0,
    });

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Step 1: If photos provided, analyze them for visual themes
    let photoAnalysis = '';
    if (body.photos && body.photos.length > 0) {
      try {
        const photoUrl = body.photos[0].startsWith('ipfs://')
          ? `https://${PINATA_GATEWAY}/ipfs/${body.photos[0].replace('ipfs://', '')}`
          : body.photos[0];

        // Fetch the image
        const imageResponse = await fetch(photoUrl);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString('base64');
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

          // Analyze photo with Gemini
          const analysisResult = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Image,
                    },
                  },
                  {
                    text: `Analyze this photo of ${body.locationName} in ${body.city}, ${body.country}.

In 2-3 sentences, describe:
1. The dominant colors and visual mood
2. Key architectural or natural elements
3. Cultural symbols or unique features that would work well in a travel stamp design

Be concise and focus on visual elements only.`,
                  },
                ],
              },
            ],
          });

          photoAnalysis = analysisResult.text || '';
          console.log('[GenerateExperienceStamp] Photo analysis:', photoAnalysis.substring(0, 200));
        }
      } catch (photoError) {
        console.log('[GenerateExperienceStamp] Photo analysis skipped:', photoError);
      }
    }

    // Step 2: Determine experience icon based on type
    const typeIcons: Record<string, string> = {
      food: 'fork and knife, dining elements',
      attraction: 'landmark silhouette, monument',
      hotel: 'bed icon, hospitality symbol',
      entertainment: 'musical notes, theater masks',
      nature: 'leaf, mountain, tree',
      shopping: 'shopping bag, boutique',
      other: 'star, compass',
    };
    const experienceIcon = typeIcons[body.experienceType || 'other'];

    // Step 3: Build the stamp generation prompt
    const stampPrompt = `Create a circular travel passport stamp design for EmpowerTours.

LOCATION: ${body.locationName}
CITY: ${body.city}, ${body.country}
EXPERIENCE TYPE: ${body.experienceType || 'attraction'}
STYLE: ${body.style || 'vintage'}
${photoAnalysis ? `VISUAL INSPIRATION: ${photoAnalysis}` : ''}
${body.description ? `VIBE: ${body.description.substring(0, 100)}` : ''}

DESIGN REQUIREMENTS:
1. CIRCULAR passport stamp format (like a real travel stamp)
2. Include "EMPOWERTOURS" text at the top arc
3. Include "${body.locationName.toUpperCase()}" prominently in the center
4. Include "${body.city}" and country flag or symbol
5. Add decorative borders with ${experienceIcon} motifs
6. Use a cohesive color palette (2-3 colors max)
7. Include a small "VERIFIED" or checkmark element
8. Style: ${body.style || 'vintage'} travel stamp aesthetic
9. Make it look like an authentic, high-quality passport stamp
10. Resolution suitable for display (circular, ~400px)

The stamp should feel like a collectible travel souvenir that captures the essence of visiting ${body.locationName}.`;

    console.log('[GenerateExperienceStamp] Generating image with Nano Banana...');

    // Step 4: Generate the stamp image using Gemini 2.5 Flash Image (Nano Banana)
    const imageResult = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: stampPrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    // Extract the generated image
    let stampImageBase64: string | null = null;
    let stampDescription = '';

    if (imageResult.candidates && imageResult.candidates[0]?.content?.parts) {
      for (const part of imageResult.candidates[0].content.parts) {
        if (part.text) {
          stampDescription = part.text;
        } else if (part.inlineData?.data) {
          stampImageBase64 = part.inlineData.data;
        }
      }
    }

    if (!stampImageBase64) {
      console.error('[GenerateExperienceStamp] No image generated');
      return NextResponse.json({
        success: false,
        error: 'Failed to generate stamp image',
      }, { status: 500 });
    }

    console.log('[GenerateExperienceStamp] Image generated, uploading to IPFS...');

    // Step 5: Upload to IPFS via Pinata
    if (!PINATA_JWT) {
      // Return base64 if no IPFS configured
      return NextResponse.json({
        success: true,
        stampImageBase64,
        stampDescription,
        ipfsHash: null,
        message: 'Stamp generated (IPFS not configured)',
      });
    }

    // Convert base64 to blob and upload
    const imageBuffer = Buffer.from(stampImageBase64, 'base64');
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, `stamp-${body.locationName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`);
    formData.append('pinataMetadata', JSON.stringify({
      name: `EmpowerTours Stamp - ${body.locationName}`,
      keyvalues: {
        location: body.locationName,
        city: body.city,
        country: body.country,
        type: body.experienceType || 'attraction',
      },
    }));

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    });

    if (!pinataRes.ok) {
      const errorText = await pinataRes.text();
      console.error('[GenerateExperienceStamp] Pinata upload failed:', errorText);
      return NextResponse.json({
        success: true,
        stampImageBase64,
        stampDescription,
        ipfsHash: null,
        error: 'IPFS upload failed, returning base64',
      });
    }

    const pinataData = await pinataRes.json();
    const ipfsHash = pinataData.IpfsHash;
    const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

    console.log('[GenerateExperienceStamp] Success:', { ipfsHash, ipfsUrl });

    return NextResponse.json({
      success: true,
      ipfsHash,
      ipfsUrl,
      stampDescription,
      metadata: {
        locationName: body.locationName,
        city: body.city,
        country: body.country,
        experienceType: body.experienceType || 'attraction',
        style: body.style || 'vintage',
        createdAt: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[GenerateExperienceStamp] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate stamp',
    }, { status: 500 });
  }
}
