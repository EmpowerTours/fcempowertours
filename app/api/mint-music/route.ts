import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface } from 'ethers';

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0xF4aa283e1372b0F96C9eA0E64Da496cA2c992bC2';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// ✅ CORRECT ABI from the contract
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' }
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'artist', type: 'address' },
      { indexed: false, internalType: 'string', name: 'tokenURI', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'price', type: 'uint256' }
    ],
    name: 'MasterMinted',
    type: 'event',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // ✅ Accept multiple field name variations
    const { recipient, tokenURI, metadataCID, metadataCid, fid } = body;
    
    // Construct proper tokenURI - handle all variations
    let finalTokenURI = tokenURI;
    const cid = metadataCid || metadataCID;
    
    if (!finalTokenURI && cid) {
      finalTokenURI = `ipfs://${cid}`;
    }
    
    console.log('🎵 Music NFT mint request (server-paid FREE):', {
      recipient,
      tokenURI: finalTokenURI,
      metadataCid: cid,
      fid,
      contract: MUSIC_NFT_ADDRESS,
    });

    // ✅ Validate inputs
    if (!recipient) {
      console.error('❌ Missing recipient address');
      return NextResponse.json({ error: 'Missing recipient address' }, { status: 400 });
    }
    
    if (!finalTokenURI || finalTokenURI === 'ipfs://undefined' || finalTokenURI === 'undefined') {
      console.error('❌ Invalid tokenURI:', { 
        finalTokenURI, 
        metadataCid: cid, 
        tokenURI,
        receivedBody: body 
      });
      return NextResponse.json({ 
        error: 'Missing or invalid metadata CID',
        debug: { finalTokenURI, metadataCid: cid, tokenURI }
      }, { status: 400 });
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      console.error('❌ Missing DEPLOYER_PRIVATE_KEY');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('⚡ Minting music master NFT (server pays - FREE for user)...');

    // Default price: 0 (free to stream for license holders)
    const price = 0;

    // ✅ Call mintMaster (not mintMusic)
    const tx = await contract.mintMaster(
      recipient,      // artist address
      finalTokenURI, // metadata URI
      price          // price (0 = free)
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
            if (parsed?.name === 'MasterMinted') {
              tokenId = Number(parsed.args[0]);
              console.log('✅ Extracted tokenId from MasterMinted event:', tokenId);
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

    console.log('✅ Music Master NFT minted (FREE - server paid gas)!', {
      tokenId,
      txHash: tx.hash,
      artist: recipient,
      tokenURI: finalTokenURI,
      price,
    });

    // Post to Farcaster if FID provided
    if (fid) {
      try {
        const castText = `🎵 New Music Master NFT Minted! Token #${tokenId}\n\n⚡ Free minting powered by EmpowerTours\n🎶 Stream with license\n\nView: https://testnet.monadscan.com/tx/${tx.hash}`;
        
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
      price,
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
