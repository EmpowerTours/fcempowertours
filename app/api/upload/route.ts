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

    if (!previewFile || !fullFile || !coverFile || !description || !address) {
      return NextResponse.json(
        { error: 'Missing required fields: previewAudio, fullAudio, cover, description, address' },
        { status: 400 }
      );
    }

    console.log('📤 Starting upload process...');
    console.log('📦 Files received:', {
      preview: previewFile instanceof File ? previewFile.name : 'not a file',
      full: fullFile instanceof File ? fullFile.name : 'not a file',
      cover: coverFile instanceof File ? coverFile.name : 'not a file',
      description,
      address,
    });

    // Ensure we have File objects
    if (!(previewFile instanceof File) || !(fullFile instanceof File) || !(coverFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid file upload. All files must be valid File objects.' },
        { status: 400 }
      );
    }

    // Helper function to upload file to Pinata
    const uploadFileToPinata = async (file: File, fileType: string) => {
      const data = new FormData();
      data.append('file', file);

      try {
        const response = await axios.post(PINATA_API_URL, data, {
          headers: {
            'Authorization': `Bearer ${PINATA_JWT}`,
          },
        });

        if (!response.data.IpfsHash) {
          throw new Error(`No IPFS hash returned for ${fileType}`);
        }

        // ✅ FIX: Ensure hash is uppercase (CIDv0 format)
        const hash = response.data.IpfsHash;
        console.log(`✅ ${fileType} uploaded: ${hash}`);
        
        // Validate hash format
        if (!hash.startsWith('Qm') && !hash.startsWith('bafy')) {
          console.warn(`⚠️ Unusual hash format for ${fileType}: ${hash}`);
        }

        return hash;
      } catch (error) {
        console.error(`❌ Failed to upload ${fileType}:`, error);
        throw new Error(`Failed to upload ${fileType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    // Upload preview clip (for NFT animation_url)
    console.log('📤 Uploading preview audio...');
    const previewCid = await uploadFileToPinata(previewFile, 'preview audio');

    // Upload full song (for external_url)
    console.log('📤 Uploading full song...');
    const fullCid = await uploadFileToPinata(fullFile, 'full song');

    // Upload cover image (for image field)
    console.log('📤 Uploading cover image...');
    const coverCid = await uploadFileToPinata(coverFile, 'cover image');

    // ✅ FIXED: Proper metadata structure with correct field names
    const metadata = {
      name: description,  // ✅ Use the actual song title from user input
      description: `Music NFT by ${address.slice(0, 6)}...${address.slice(-4)}`,
      image: `ipfs://${coverCid}`,  // ✅ Cover art for display
      animation_url: `ipfs://${previewCid}`,  // ✅ Preview audio (30s clip)
      external_url: `ipfs://${fullCid}`,  // ✅ Full track (for access after purchase)
      attributes: [
        { trait_type: 'Creator Address', value: address },
        { trait_type: 'Creator FID', value: fid || 'Unknown' },
        { trait_type: 'Preview CID', value: previewCid },
        { trait_type: 'Full Track CID', value: fullCid },
      ],
    };

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
      });
    } catch (error) {
      console.error('❌ Metadata upload failed:', error);
      throw new Error(`Metadata upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (!metadataResponse.data.IpfsHash) {
      throw new Error('No IPFS hash returned for metadata');
    }

    const metadataCid = metadataResponse.data.IpfsHash;
    
    // ✅ FIX: Validate hash format
    if (!metadataCid.startsWith('Qm') && !metadataCid.startsWith('bafy')) {
      console.warn(`⚠️ Unusual metadata hash format: ${metadataCid}`);
    }

    console.log('✅ Metadata uploaded successfully:', metadataCid);

    // ✅ Return comprehensive response
    const response = {
      success: true,
      previewCid,
      fullCid,
      coverCid,
      metadataCid,
      metadataCID: metadataCid,  // camelCase variation for compatibility
      tokenURI: `ipfs://${metadataCid}`,
      // ✅ Also return gateway URLs for easy verification
      previewUrl: `https://${PINATA_GATEWAY}/ipfs/${previewCid}`,
      fullUrl: `https://${PINATA_GATEWAY}/ipfs/${fullCid}`,
      coverUrl: `https://${PINATA_GATEWAY}/ipfs/${coverCid}`,
      metadataUrl: `https://${PINATA_GATEWAY}/ipfs/${metadataCid}`,
    };

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
