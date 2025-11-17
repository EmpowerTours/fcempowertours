import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_JWT = process.env.PINATA_JWT!;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const previewFile = formData.get('previewAudio');
    const fullFile = formData.get('fullAudio');
    const coverFile = formData.get('cover');
    const description = formData.get('description') as string;
    const fid = formData.get('fid') as string;
    const address = formData.get('address') as string;
    const isArtOnly = formData.get('isArtOnly') === 'true';

    // ✅ Support art-only NFTs: only cover, description, and address are required
    if (!coverFile || !description || !address) {
      return NextResponse.json(
        { error: 'Missing required fields: cover, description, address' },
        { status: 400 }
      );
    }

    // ✅ If one audio file is provided, require both
    if ((previewFile && !fullFile) || (!previewFile && fullFile)) {
      return NextResponse.json(
        { error: 'If uploading music, please provide both previewAudio and fullAudio' },
        { status: 400 }
      );
    }

    console.log('📤 Starting upload process...');
    console.log('📦 Files received:', {
      preview: previewFile instanceof File ? previewFile.name : 'not provided',
      full: fullFile instanceof File ? fullFile.name : 'not provided',
      cover: coverFile instanceof File ? coverFile.name : 'not a file',
      description,
      address,
      isArtOnly,
    });

    // ✅ Ensure cover is a File object
    if (!(coverFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid cover file upload. Cover must be a valid File object.' },
        { status: 400 }
      );
    }

    // ✅ If audio files are provided, ensure they are File objects
    if (previewFile && !(previewFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid preview audio file.' },
        { status: 400 }
      );
    }

    if (fullFile && !(fullFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid full audio file.' },
        { status: 400 }
      );
    }

    // ✅ CRITICAL: Validate file sizes BEFORE upload
    if (previewFile instanceof File && previewFile.size > 600 * 1024) {
      return NextResponse.json({
        success: false,
        error: `Preview audio too large: ${(previewFile.size / 1024).toFixed(0)}KB. Max 600KB. Please compress to MP3 format.`,
      }, { status: 400 });
    }

    if (fullFile instanceof File && fullFile.size > 15 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        error: `Full track too large: ${(fullFile.size / 1024 / 1024).toFixed(1)}MB. Max 15MB.`,
      }, { status: 400 });
    }

    if (coverFile.size > 3 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        error: `Cover art too large: ${(coverFile.size / 1024 / 1024).toFixed(1)}MB. Max 3MB.`,
      }, { status: 400 });
    }

    // ✅ IMPROVED: Helper function with retry logic and exponential backoff
    const uploadFileToPinata = async (file: File, fileType: string, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const data = new FormData();
          data.append('file', file);

          console.log(`📤 [Attempt ${attempt}/${maxRetries}] Uploading ${fileType} (${(file.size / 1024).toFixed(0)}KB)...`);

          const response = await axios.post(PINATA_API_URL, data, {
            headers: {
              'Authorization': `Bearer ${PINATA_JWT}`,
            },
            timeout: 60000, // 60 second timeout
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          if (!response.data.IpfsHash) {
            throw new Error(`No IPFS hash returned for ${fileType}`);
          }

          const hash = response.data.IpfsHash;
          console.log(`✅ ${fileType} uploaded successfully: ${hash}`);
          
          // ✅ Validate hash format
          if (!hash.startsWith('Qm') && !hash.startsWith('bafy')) {
            console.warn(`⚠️ Unusual hash format for ${fileType}: ${hash}`);
          }

          return hash;
        } catch (error: any) {
          console.error(`❌ Attempt ${attempt} failed for ${fileType}:`, error.message);
          
          if (attempt === maxRetries) {
            throw new Error(`Failed to upload ${fileType} after ${maxRetries} attempts: ${error.message}`);
          }
          
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw new Error(`Upload failed for ${fileType}`);
    };

    // ✅ Conditionally upload audio files (only if provided)
    let previewCid = null;
    let fullCid = null;

    if (previewFile instanceof File && fullFile instanceof File) {
      // Upload preview clip (for NFT animation_url)
      console.log('📤 Uploading preview audio...');
      previewCid = await uploadFileToPinata(previewFile, 'preview audio');

      // Upload full song (for external_url)
      console.log('📤 Uploading full song...');
      fullCid = await uploadFileToPinata(fullFile, 'full song');
    } else {
      console.log('📸 Art-only NFT detected, skipping audio uploads');
    }

    // Upload cover image (for image field)
    console.log('📤 Uploading cover image...');
    const coverCid = await uploadFileToPinata(coverFile, 'cover image');

    // ✅ FIXED: Proper metadata structure with conditional audio fields
    const metadata: any = {
      name: description,  // ✅ Use the actual song title from user input
      description: isArtOnly
        ? `Art NFT by ${address.slice(0, 6)}...${address.slice(-4)}`
        : `Music NFT by ${address.slice(0, 6)}...${address.slice(-4)}`,
      image: `ipfs://${coverCid}`,  // ✅ Cover art for display
      attributes: [
        { trait_type: 'Creator Address', value: address },
        { trait_type: 'Creator FID', value: fid || 'Unknown' },
        { trait_type: 'Type', value: isArtOnly ? 'Art' : 'Music' },
      ],
    };

    // ✅ Only add audio fields if this is a music NFT
    if (previewCid && fullCid) {
      metadata.animation_url = `ipfs://${previewCid}`;  // ✅ Preview audio (30s clip)
      metadata.external_url = `ipfs://${fullCid}`;  // ✅ Full track (for access after purchase)
      metadata.attributes.push(
        { trait_type: 'Preview CID', value: previewCid },
        { trait_type: 'Full Track CID', value: fullCid }
      );
    }

    console.log('📝 Metadata prepared:', {
      name: metadata.name,
      image: metadata.image,
      animation_url: metadata.animation_url,
      external_url: metadata.external_url,
    });

    console.log('📤 Uploading metadata to Pinata...');
    
    let metadataResponse;
    try {
      metadataResponse = await axios.post(PINATA_JSON_URL, metadata, {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      });
    } catch (error: any) {
      console.error('❌ Metadata upload failed:', error.message);
      throw new Error(`Metadata upload failed: ${error.message}`);
    }

    if (!metadataResponse.data.IpfsHash) {
      throw new Error('No IPFS hash returned for metadata');
    }

    const metadataCid = metadataResponse.data.IpfsHash;
    
    // ✅ Validate hash format
    if (!metadataCid.startsWith('Qm') && !metadataCid.startsWith('bafy')) {
      console.warn(`⚠️ Unusual metadata hash format: ${metadataCid}`);
    }

    console.log('✅ Metadata uploaded successfully:', metadataCid);

    // ✅ Return comprehensive response with conditional audio URLs
    const response: any = {
      success: true,
      coverCid,
      metadataCid,
      metadataCID: metadataCid,  // camelCase variation for compatibility
      tokenURI: `ipfs://${metadataCid}`,
      coverUrl: `https://${PINATA_GATEWAY}/ipfs/${coverCid}`,
      metadataUrl: `https://${PINATA_GATEWAY}/ipfs/${metadataCid}`,
      isArtOnly,
    };

    // ✅ Only include audio URLs if this is a music NFT
    if (previewCid && fullCid) {
      response.previewCid = previewCid;
      response.fullCid = fullCid;
      response.previewUrl = `https://${PINATA_GATEWAY}/ipfs/${previewCid}`;
      response.fullUrl = `https://${PINATA_GATEWAY}/ipfs/${fullCid}`;
    }

    console.log('📤 Upload complete! Response:', {
      tokenURI: response.tokenURI,
      metadataUrl: response.metadataUrl,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('❌ Upload failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      details: errorDetails,
    }, { status: 500 });
  }
}
