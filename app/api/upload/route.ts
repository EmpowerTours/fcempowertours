import { NextRequest, NextResponse } from 'next/server';
import { PinataSDK } from 'pinata';

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY || undefined,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const previewFile = formData.get('previewAudio') as File;
    const fullFile = formData.get('fullAudio') as File;
    const coverFile = formData.get('cover') as File;
    const description = formData.get('description') as string;
    const fid = formData.get('fid') as string;
    const address = formData.get('address') as string;

    if (!previewFile || !fullFile || !coverFile || !description || !address) {
      return NextResponse.json(
        { error: 'Missing required fields: previewAudio, fullAudio, cover, description, address' },
        { status: 400 }
      );
    }

    // Upload preview clip (for NFT mint)
    const { cid: previewCid } = await pinata.upload.public.file(previewFile);
    console.log('Preview uploaded:', previewCid);

    // Upload full song (for streaming)
    const { cid: fullCid } = await pinata.upload.public.file(fullFile);
    console.log('Full song uploaded:', fullCid);

    // Upload cover image
    const { cid: coverCid } = await pinata.upload.public.file(coverFile);
    console.log('Cover uploaded:', coverCid);

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

    const { cid: metadataCid } = await pinata.upload.public.json(metadata);
    console.log('Metadata uploaded:', metadataCid);

    return NextResponse.json({
      previewCid,
      fullCid,
      coverCid,
      metadataCid,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
