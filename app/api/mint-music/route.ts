import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const MUSIC_NFT_ADDRESS = '0x821ad43127ED630aAe974BA0Aa063235af8d00Dd';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const MUSIC_NFT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenURI', type: 'string' },
      { name: 'preview', type: 'bytes' },
      { name: 'coverArtBase64', type: 'string' },
      { name: 'artist', type: 'address' }
    ],
    name: 'mintFree',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, metadataCid, previewCid, fullSongCid, coverCid, artist, fid } = body;

    console.log('🎵 Music NFT mint request (server-paid FREE):', {
      recipient,
      tokenURI: metadataCid ? `ipfs://${metadataCid}` : 'MISSING',
      hasPreview: !!previewCid,
      hasCoverArt: !!coverCid,
      artist: artist || recipient,
      fid
    });

    const tokenURI = metadataCid ? `ipfs://${metadataCid}` : null;
    if (!recipient || !tokenURI) {
      return NextResponse.json(
        { error: 'Missing recipient or metadataCid' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('⚡ Minting music NFT (server pays - FREE for user)...');

    const previewBytes = previewCid ? Buffer.from(`ipfs://${previewCid}`).toString('hex') : '0x';
    const coverArtBase64 = coverCid ? `ipfs://${coverCid}` : '';
    const artistAddress = artist || recipient;

    const tx = await contract.mintFree(
      recipient,
      tokenURI,
      `0x${Buffer.from(previewBytes).toString('hex')}`,
      coverArtBase64,
      artistAddress
    );

    console.log('📤 Mint tx sent:', tx.hash);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }

    console.log('✅ Music NFT minted (FREE - server paid gas)!');

    if (fid) {
      try {
        const castText = `🎵 New Music NFT Minted!\n\n⚡ Free minting powered by EmpowerTours\n\nView: https://testnet.monadscan.com/tx/${tx.hash}`;
        await fetch('https://api.neynar.com/v2/farcaster/cast', {
          method: 'POST',
          headers: {
            'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            signer_uuid: process.env.BOT_SIGNER_UUID,
            text: castText,
          }),
        });
        console.log('📢 Cast posted');
      } catch (castError) {
        console.warn('⚠️ Cast failed (mint succeeded):', castError);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      recipient,
      tokenURI,
    });

  } catch (error: any) {
    console.error('❌ Server-paid mint error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Server-paid mint failed',
        details: error.reason || error.message,
      },
      { status: 500 }
    );
  }
}
