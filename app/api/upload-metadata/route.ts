import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { Redis } from "@upstash/redis";

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

    // 2️⃣ Generate AI Passport Image with DeepAI
    const prompt = `A high-quality digital passport cover for ${countryName}. Elegant modern travel aesthetic, gold embossed text 'EmpowerTours Passport - ${countryName}', subtle global elements like faint world map overlay or vintage stamp texture. Clean composition, passport-blue color scheme.`;
    
    const deepAIRes = await axios.post(
      "https://api.deepai.org/api/text2img",
      {
        text: prompt,
        grid_size: 1,
        width: 512,
        height: 512,
      },
      {
        headers: {
          "api-key": process.env.DEEPAI_API_KEY!, // Add to .env.local
        },
      }
    );
    
    if (!deepAIRes.data.output_url) throw new Error("DeepAI image generation failed");
    const imageRes = await axios.get(deepAIRes.data.output_url, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(imageRes.data);

    // 3️⃣ Upload Image to Pinata
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

    // 4️⃣ Create NFT metadata
    const metadata = {
      name: `EmpowerTours Passport - ${countryName}`,
      description: `Official EmpowerTours digital travel passport for ${countryName}. AI-generated cover.`,
      image: imageURI,
      attributes: [
        { trait_type: "Country", value: countryName },
        { trait_type: "Code", value: countryCode },
        { trait_type: "Collection", value: "EmpowerTours Passport" },
        { trait_type: "GeneratedBy", value: "DeepAI" },
      ],
    };

    // 5️⃣ Upload metadata JSON to Pinata
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

    // 6️⃣ Cache in Redis (30 days)
    await redis.set(cacheKey, tokenURI, { ex: 60 * 60 * 24 * 30 });
    console.log("✅ AI Passport generated and cached:", tokenURI);

    return NextResponse.json({ tokenURI });
  } catch (error: any) {
    console.error("❌ Error:", error);
    return NextResponse.json(
      { error: error.message || "Generation failed" },
      { status: 500 }
    );
  }
}
