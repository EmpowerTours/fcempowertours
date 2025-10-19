import { NextRequest, NextResponse } from 'next/server';
import { PinataSDK } from 'pinata';

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY || undefined,
});

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

    // Upload preview clip (for NFT mint)
    console.log('📤 Uploading preview audio...');
    const previewUpload = await pinata.upload.file(previewFile);
    const previewCid = previewUpload.IpfsHash || previewUpload.cid;
    console.log('✅ Preview uploaded:', previewCid);

    // Upload full song (for streaming)
    console.log('📤 Uploading full song...');
    const fullUpload = await pinata.upload.file(fullFile);
    const fullCid = fullUpload.IpfsHash || fullUpload.cid;
    console.log('✅ Full song uploaded:', fullCid);

    // Upload cover image
    console.log('📤 Uploading cover image...');
    const coverUpload = await pinata.upload.file(coverFile);
    const coverCid = coverUpload.IpfsHash || coverUpload.cid;
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
    const metadataUpload = await pinata.upload.json(metadata);
    const metadataCid = metadataUpload.IpfsHash || metadataUpload.cid;
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
