import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { Redis } from "@upstash/redis";
import { GoogleGenAI } from "@google/genai";

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(req: NextRequest) {
  try {
    const { countryCode, countryName } = await req.json();
    if (!countryCode || !countryName) {
      throw new Error("Missing countryCode or countryName in request body");
    }

    // Debug environment variables
    console.log("PINATA_JWT:", process.env.PINATA_JWT ? "Set" : "Missing");
    console.log("PINATA_GATEWAY:", process.env.PINATA_GATEWAY);
    console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Set" : "Missing");

    // 1️⃣ Check Redis cache
    const cacheKey = `passport:${countryCode}`;
    const cachedURI = await redis.get(cacheKey);
    if (cachedURI) {
      console.log("✅ Cache hit for", countryName);
      return NextResponse.json({ tokenURI: cachedURI });
    }

    // 2️⃣ Generate edited image with Gemini (optional)
    let imageURI = "ipfs://QmdbDrCJujsHaLVR4fXYJoTExMnmPvSt9ccWEuK41UVyV3"; // Fallback
    const useGemini = process.env.USE_GEMINI === "true";
    if (useGemini && process.env.GEMINI_API_KEY) {
      try {
        // Fetch splash.png
        const splashUrl = "https://fcempowertours-production-6551.up.railway.app/images/splash.png";
        const splashRes = await axios.get(splashUrl, { responseType: "arraybuffer" });
        const splashBase64 = Buffer.from(splashRes.data).toString("base64");

        // Gemini prompt
        const prompt = `Using the provided image of a passport cover, add the text "${countryName}" directly below the word "Passport". Ensure the text matches the font style, size, color, and alignment of the existing "Passport" text for seamless integration. Preserve the original style, lighting, and composition. Output a base64-encoded PNG string.`;
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              inlineData: {
                data: splashBase64,
                mimeType: "image/png",
              },
            },
            { text: prompt },
          ],
        });
        const response = result;
        console.log("Gemini response:", JSON.stringify(response, null, 2));

        const textPart = response.candidates?.[0]?.content?.parts?.find(
          (part: any) => part.text
        );
        if (textPart?.text && textPart.text.startsWith("data:image/png;base64,")) {
          const base64Data = textPart.text.split(",")[1];
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Upload to Pinata
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
          imageURI = `ipfs://${uploadRes.data.IpfsHash}`;
          console.log("Gemini image uploaded to IPFS:", imageURI);
        } else {
          throw new Error("Gemini failed to return base64 image");
        }
      } catch (geminiError: any) {
        console.error("Gemini error:", geminiError.message);
        if (geminiError.message.includes("429") || geminiError.message.includes("quota")) {
          console.warn("Gemini quota exceeded; using fallback image");
        }
        // Fallback
      }
    }

    // 3️⃣ Create NFT metadata
    const metadata = {
      name: `EmpowerTours Passport - ${countryName}`,
      description: `Official EmpowerTours digital travel passport for ${countryName}. ${useGemini ? "AI-edited cover with Gemini" : "Standard cover image"}.`,
      image: imageURI,
      attributes: [
        { trait_type: "Country", value: countryName },
        { trait_type: "Code", value: countryCode },
        { trait_type: "Collection", value: "EmpowerTours Passport" },
        { trait_type: "GeneratedBy", value: useGemini ? "Gemini 1.5 Flash" : "Static Image" },
      ],
    };

    // 4️⃣ Upload metadata to Pinata
    const metaForm = new FormData();
    metaForm.append(
      "file",
      Buffer.from(JSON.stringify(metadata)),
      `passport-${countryCode}.json`
    );
    console.log("Uploading metadata to Pinata...");
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
    const tokenURI = `ipfs://${metaRes.data.IpfsHash}`;
    console.log("Metadata uploaded to IPFS:", tokenURI);

    // 5️⃣ Cache in Redis (30 days)
    await redis.set(cacheKey, tokenURI, { ex: 60 * 60 * 24 * 30 });
    console.log("✅ Passport metadata generated and cached:", tokenURI);

    return NextResponse.json({ tokenURI });
  } catch (error: any) {
    console.error("❌ Error:", {
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      details: error.response?.data,
    });
    return NextResponse.json(
      { error: error.message || "Generation failed" },
      { status: error.response?.status || 500 }
    );
  }
}
