import { NextRequest, NextResponse } from 'next/server';
import { PinataSDK } from 'pinata';  // v2: Named import from 'pinata'

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,  // Required; from dashboard
  pinataGateway: process.env.PINATA_GATEWAY || undefined,  // Your dedicated gateway
});

// POST /api/upload
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const description = formData.get('description') as string;
    const fid = formData.get('fid') as string;
    const address = formData.get('address') as string;

    if (!audioFile || !description || !address) {
      return NextResponse.json({ error: 'Missing required fields: audio, description, address' }, { status: 400 });
    }

    // Step 1: Upload audio file to Pinata/IPFS
    const { cid: audioCid } = await pinata.upload.public.file(audioFile);
    console.log('Audio uploaded:', audioCid);

    // Step 2: Build & upload metadata JSON to Pinata/IPFS
    const metadataJSON = {
      name: `Music Track - ${audioFile.name}`,
      description,
      animation_url: `ipfs://${audioCid}`,
      attributes: [
        { trait_type: 'Creator Address', value: address },
        { trait_type: 'Creator FID', value: fid || 'Unknown' },
      ],
    };
    const { cid: metadataCid } = await pinata.upload.public.json(metadataJSON);
    console.log('Metadata uploaded:', metadataCid);

    return NextResponse.json({ audioCid, metadataCid });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
