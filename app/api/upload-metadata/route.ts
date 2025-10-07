import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";
import { Redis } from "@upstash/redis";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    // 2️⃣ Fetch splash.png and convert to base64
    const splashUrl = "https://fcempowertours-production-6551.up.railway.app/images/splash.png";
    console.log("Fetching splash.png from:", splashUrl);
    const splashRes = await axios.get(splashUrl, { responseType: "arraybuffer" });
    const splashBuffer = Buffer.from(splashRes.data);
    const splashBase64 = splashBuffer.toString("base64");

    // 3️⃣ Generate edited image with Gemini
    const prompt = `Using the provided image of a passport cover, add the text "${countryName}" directly below the word "Passport". Ensure the text matches the font style, size, color, and alignment of the existing "Passport" text for seamless integration. Preserve the original style, lighting, and composition of the image. Output a square 1:1 aspect ratio image as a base64-encoded PNG.`;
    console.log("Generating edited image with Gemini for:", countryName);

    let imageURI = "ipfs://QmdbDrCJujsHaLVR4fXYJoTExMnmPvSt9ccWEuK41UVyV3"; // Fallback image
    if (process.env.GEMINI_API_KEY) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
        const result = await model.generateContent([
          {
            inlineData: {
              data: splashBase64,
              mimeType: "image/png",
            },
          },
          { text: prompt },
        ]);
        const response = await result.response;
        console.log("Gemini response:", JSON.stringify(response, null, 2)); // Debug

        // Assume response contains base64 image in text (adjust based on actual response)
        const textPart = response.candidates?.[0]?.content?.parts?.find(
          (part: any) => part.text
        );
        if (textPart?.text) {
          const imageBase64 = textPart.text; // Adjust if response structure differs
          const imageBuffer = Buffer.from(imageBase64, "base64");
          console.log("Gemini image edited successfully");

          // 4️⃣ Upload edited image to Pinata
          const form = new FormData();
          form.append("file", imageBuffer, {
            filename: `passport-${countryCode}.png`,
            contentType: "image/png",
          });
          console.log("Uploading image to Pinata...");
          const uploadRes = await axios.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            form,
            {
              headers: {
                Authorization: `Bearer ${process.env.PINATA_JWT}`,
                ...form.getHeaders(),
              },
            }
          ).catch((error) => {
            throw new Error(`Pinata image upload failed: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
          });
          imageURI = `ipfs://${uploadRes.data.IpfsHash}`;
          console.log("Image uploaded to IPFS:", imageURI);
        } else {
          throw new Error("Gemini image editing failed: No base64 image data in response");
        }
      } catch (geminiError: any) {
        console.error("Gemini error:", {
          message: geminiError.message,
          status: geminiError.response?.status,
          details: geminiError.response?.data,
        });
        // Use fallback image
      }
    } else {
      console.warn("GEMINI_API_KEY is missing; using default image");
    }

    // 5️⃣ Create NFT metadata
    const metadata = {
      name: `EmpowerTours Passport - ${countryName}`,
      description: `Official EmpowerTours digital travel passport for ${countryName}. AI-edited cover with Gemini, based on the original splash image.`,
      image: imageURI,
      attributes: [
        { trait_type: "Country", value: countryName },
        { trait_type: "Code", value: countryCode },
        { trait_type: "Collection", value: "EmpowerTours Passport" },
        { trait_type: "GeneratedBy", value: "Gemini 2.5 Flash Image" },
      ],
    };

    // 6️⃣ Upload metadata JSON to Pinata
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
    ).catch((error) => {
      throw new Error(`Pinata metadata upload failed: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
    });
    const metadataCID = metaRes.data.IpfsHash;
    const tokenURI = `ipfs://${metadataCID}`;
    console.log("Metadata uploaded to IPFS:", tokenURI);

    // 7️⃣ Cache in Redis (30 days)
    await redis.set(cacheKey, tokenURI, { ex: 60 * 60 * 24 * 30 });
    console.log("✅ AI Passport generated and cached:", tokenURI);

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
