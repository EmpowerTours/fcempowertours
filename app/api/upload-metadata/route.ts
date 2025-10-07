import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import FormData from "form-data";
import sharp from "sharp";
import { Redis } from "@upstash/redis";

// Initialize Gemini (now with image-capable model)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function POST(req: NextRequest) {
  try {
    const { countryCode, countryName } = await req.json();

    // 1️⃣ Check Redis cache
    const cacheKey = `passport:${countryCode}`;
    const cachedURI = await redis.get(cacheKey);
    if (cachedURI) {
      console.log("✅ Cache hit for", countryName);
      return NextResponse.json({ tokenURI: cachedURI });
    }

    // 2️⃣ Generate AI Passport Image with Gemini (Imagen 3)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" }); // Image-gen enabled
    const prompt = `Generate a high-quality digital passport cover image for ${countryName}. Elegant modern travel aesthetic, gold embossed text 'EmpowerTours Passport - ${countryName}', subtle global elements like faint world map overlay or vintage stamp texture. Clean composition, passport-blue color scheme.`;
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "image/png", // Output as PNG
        responseModalities: ["image"], // Force image response
      },
    });
    
    const imagePart = result.response.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.mimeType === "image/png");
    if (!imagePart?.inlineData?.data) throw new Error("Failed to generate image from Gemini");
    
    let imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");

    // 3️⃣ Add Watermark (Hologram Effect)
    const logoUrl = "https://fcempowertours-production-6551.up.railway.app/images/feed.png";
    const logoRes = await axios.get(logoUrl, { responseType: "arraybuffer" });
    const logoBuffer = Buffer.from(logoRes.data);

    imageBuffer = await sharp(imageBuffer)
      .resize(512, 512) // Ensure consistent size
      .composite([
        {
          input: await sharp(logoBuffer)
            .resize(200)
            .modulate({ lightness: 20 }) // Hologram glow
            .toBuffer(),
          gravity: "center",
          blend: "over",
          opacity: 0.5,
        },
      ])
      .png() // Ensure PNG output
      .toBuffer();

    // 4️⃣ Upload Image to Pinata
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: `passport-${countryCode}.png`,
      contentType: "image/png",
    });
    const uploadRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...form.getHeaders(),
        },
      }
    );
    const imageCID = uploadRes.data.IpfsHash;
    const imageURI = `ipfs://${imageCID}`;

    // 5️⃣ Create NFT metadata
    const metadata = {
      name: `EmpowerTours Passport - ${countryName}`,
      description: `Official EmpowerTours digital travel passport for ${countryName}. AI-generated cover with hologram branding.`,
      image: imageURI,
      attributes: [
        { trait_type: "Country", value: countryName },
        { trait_type: "Code", value: countryCode },
        { trait_type: "Collection", value: "EmpowerTours Passport" },
        { trait_type: "GeneratedBy", value: "Gemini Imagen 3" },
      ],
    };

    // 6️⃣ Upload metadata JSON to Pinata
    const metaForm = new FormData();
    metaForm.append(
      "file",
      Buffer.from(JSON.stringify(metadata)),
      `passport-${countryCode}.json`
    );
    const metaRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      metaForm,
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...metaForm.getHeaders(),
        },
      }
    );
    const metadataCID = metaRes.data.IpfsHash;
    const tokenURI = `ipfs://${metadataCID}`;

    // 7️⃣ Cache in Redis (30 days)
    await redis.set(cacheKey, tokenURI, { ex: 60 * 60 * 24 * 30 });
    console.log("✅ AI Passport generated, watermarked, and cached:", tokenURI);

    return NextResponse.json({ tokenURI });
  } catch (error: any) {
    console.error("❌ Error:", error);
    return NextResponse.json(
      { error: error.message || "Generation failed" },
      { status: 500 }
    );
  }
}
