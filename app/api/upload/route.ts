import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_JWT = process.env.PINATA_JWT!;

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
    });

    // Ensure we have File objects
    if (!(previewFile instanceof File) || !(fullFile instanceof File) || !(coverFile instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid file upload. All files must be valid File objects.' },
        { status: 400 }
      );
    }

    // Helper function to upload file to Pinata
    const uploadFileToPinata = async (file: File) => {
      const data = new FormData();
      data.append('file', file);

      const response = await axios.post(PINATA_API_URL, data, {
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
        },
      });

      return response.data.IpfsHash;
    };

    // Upload preview clip (for NFT mint)
    console.log('📤 Uploading preview audio...');
    const previewCid = await uploadFileToPinata(previewFile);
    console.log('✅ Preview uploaded:', previewCid);

    // Upload full song (for streaming)
    console.log('📤 Uploading full song...');
    const fullCid = await uploadFileToPinata(fullFile);
    console.log('✅ Full song uploaded:', fullCid);

    // Upload cover image
    console.log('📤 Uploading cover image...');
    const coverCid = await uploadFileToPinata(coverFile);
    console.log('✅ Cover uploaded:', coverCid);

    // Metadata JSON
    const metadata = {
      name: `Music NFT - ${previewFile.name}`,
      description,
      image: `ipfs://${coverCid}`,
      animation_url: `ipfs://${previewCid}`,
      external_url: `ipfs://${fullCid}`,
      attributes: [
        { trait_type: 'Creator Address', value: address },
        { trait_type: 'Creator FID', value: fid || 'Unknown' },
        { trait_type: 'Preview CID', value: previewCid },
        { trait_type: 'Full Track CID', value: fullCid },
      ],
    };

    console.log('📤 Uploading metadata...');
    const metadataResponse = await axios.post(PINATA_JSON_URL, metadata, {
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
    });
    const metadataCid = metadataResponse.data.IpfsHash;
    console.log('✅ Metadata uploaded:', metadataCid);

    // Return both camelCase variations + tokenURI
    return NextResponse.json({
      previewCid,
      fullCid,
      coverCid,
      metadataCid,
      metadataCID: metadataCid,
      tokenURI: `ipfs://${metadataCid}`,
    });
  } catch (error) {
    console.error('❌ Upload failed:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Upload failed',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
