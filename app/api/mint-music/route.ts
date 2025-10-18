import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface } from 'ethers';

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0xF4aa283e1372b0F96C9eA0E64Da496cA2c992bC2';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// ✅ UPDATED: Simple ABI for MusicLicenseNFT
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { name: 'artist', type: 'address' },
      { name: 'metadataURI', type: 'string' },
      { name: 'royaltyPercentage', type: 'uint256' }
    ],
    name: 'mintMusic',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'artist', type: 'address' },
      { indexed: false, name: 'metadataURI', type: 'string' },
      { indexed: false, name: 'royaltyPercentage', type: 'uint256' }
    ],
    name: 'MusicMinted',
    type: 'event',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // ✅ FIXED: Accept both tokenURI and metadataCID formats
    const { recipient, tokenURI, metadataCID, fid } = body;
    
    // Construct proper tokenURI
    let finalTokenURI = tokenURI;
    if (!finalTokenURI && metadataCID) {
      finalTokenURI = `ipfs://${metadataCID}`;
    }
    
    console.log('🎵 Music NFT mint request (server-paid FREE):', {
      recipient,
      tokenURI: finalTokenURI,
      metadataCID,
      fid,
      contract: MUSIC_NFT_ADDRESS,
    });

    // ✅ Validate inputs
    if (!recipient) {
      return NextResponse.json({ error: 'Missing recipient address' }, { status: 400 });
    }
    
    if (!finalTokenURI || finalTokenURI === 'ipfs://undefined' || finalTokenURI === 'undefined') {
      console.error('❌ Invalid tokenURI:', { finalTokenURI, metadataCID, tokenURI });
      return NextResponse.json({ 
        error: 'Missing or invalid metadata CID',
        debug: { finalTokenURI, metadataCID, tokenURI }
      }, { status: 400 });
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('⚡ Minting music NFT (server pays - FREE for user)...');

    // Default royalty: 10%
    const royaltyPercentage = 10;

    const tx = await contract.mintMusic(
      recipient, // artist address
      finalTokenURI, // metadata URI
      royaltyPercentage // 10% royalty
    );

    console.log('📤 Mint tx sent:', tx.hash);

    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }

    // Extract tokenId from event logs
    let tokenId = 0;
    if (receipt.logs && receipt.logs.length > 0) {
      try {
        const iface = new Interface(MUSIC_NFT_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed?.name === 'MusicMinted') {
              tokenId = Number(parsed.args[0]);
              console.log('✅ Extracted tokenId from event:', tokenId);
              break;
            }
          } catch (e) {
            // Skip unparseable logs
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not parse tokenId from events:', error);
      }
    }

    console.log('✅ Music NFT minted (FREE - server paid gas)!', {
      tokenId,
      txHash: tx.hash,
      artist: recipient,
    });

    // Post to Farcaster if FID provided
    if (fid) {
      try {
        const castText = `🎵 New Music NFT Minted! Token #${tokenId}\n\n⚡ Free minting powered by EmpowerTours\n🎶 ${royaltyPercentage}% creator royalties\n\nView: https://testnet.monadscan.com/tx/${tx.hash}`;
        
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
        console.log('📢 Cast posted to Farcaster');
      } catch (castError) {
        console.warn('⚠️ Cast failed (mint succeeded):', castError);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      tokenId,
      recipient,
      tokenURI: finalTokenURI,
      royaltyPercentage,
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
