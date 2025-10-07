import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import FormData from "form-data";
import sharp from "sharp";
import { Redis } from "@upstash/redis";

// Initialize Gemini
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

    // 2️⃣ Generate AI Passport Image
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Generate a high-quality digital passport cover image for ${countryName}.
    The design should look elegant, with a modern travel aesthetic.
    Include gold embossed text 'EmpowerTours Passport - ${countryName}'
    and subtle global elements (like a map or stamp texture).`;
    const imageResult = await model.generateImage({
      prompt,
      size: "512x512",
      mimeType: "image/png",
    });
    const imageBase64 = imageResult.response.image?.data;
    if (!imageBase64) throw new Error("Failed to generate image from Gemini");
    let imageBuffer = Buffer.from(imageBase64, "base64");

    // 3️⃣ Add Watermark (Hologram Effect)
    const logoUrl = "https://fcempowertours-production-6551.up.railway.app/images/feed.png"; // EmpowerTours logo URL
    const logoRes = await axios.get(logoUrl, { responseType: "arraybuffer" });
    const logoBuffer = Buffer.from(logoRes.data);

    // Use Sharp for watermarking
    imageBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: await sharp(logoBuffer)
            .resize(200) // Resize logo to fit
            .modulate({ lightness: 20 }) // Slight hologram effect (adjust lightness)
            .toBuffer(),
          gravity: "center",
          blend: "over",
          left: 0,
          top: 0,
          opacity: 0.5, // Semi-transparent hologram
        },
      ])
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
      description: `Official EmpowerTours digital travel passport for ${countryName}.`,
      image: imageURI,
      attributes: [
        { trait_type: "Country", value: countryName },
        { trait_type: "Code", value: countryCode },
        { trait_type: "Collection", value: "EmpowerTours Passport" },
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
          ...form.getHeaders(),
        },
      }
    );
    const metadataCID = metaRes.data.IpfsHash;
    const tokenURI = `ipfs://${metadataCID}`;

    // 7️⃣ Cache in Redis (expires in 30 days)
    await redis.set(cacheKey, tokenURI, { ex: 60 * 60 * 24 * 30 });
    console.log("✅ Passport metadata uploaded and cached:", tokenURI);

    // Return the metadata URI
    return NextResponse.json({ tokenURI });
  } catch (error: any) {
    console.error("❌ Error generating metadata:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
