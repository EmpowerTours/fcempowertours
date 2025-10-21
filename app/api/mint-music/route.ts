import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface, parseEther } from 'ethers';

// ✅ UPDATED CONTRACT ADDRESS
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// MusicLicenseNFTv2 ABI
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
    const { recipient, tokenURI, metadataCID, metadataCid, price, fid } = body;

    let finalTokenURI = tokenURI;
    const cid = metadataCid || metadataCID;

    if (!finalTokenURI && cid) {
      finalTokenURI = `ipfs://${cid}`;
    }

    console.log('🎵 MusicLicenseNFTv2 mint request:', {
      recipient,
      tokenURI: finalTokenURI,
      price,
      contract: MUSIC_NFT_ADDRESS,
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Missing recipient address' }, { status: 400 });
    }

    if (!finalTokenURI || finalTokenURI === 'ipfs://undefined') {
      return NextResponse.json({ error: 'Missing or invalid metadata CID' }, { status: 400 });
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Parse price from string to wei
    let priceInWei: string;
    if (price) {
      try {
        priceInWei = parseEther(price.toString()).toString();
      } catch (err) {
        console.error('Invalid price format:', price);
        priceInWei = parseEther('0.01').toString();
      }
    } else {
      priceInWei = parseEther('0.01').toString();
    }

    console.log('💰 Price in wei:', priceInWei, `(${price || '0.01'} ETH)`);

    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('⚡ Minting music master NFT...');

    const tx = await contract.mintMaster(recipient, finalTokenURI, priceInWei);
    console.log('📤 Mint tx sent:', tx.hash);

    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }

    let tokenId = 0;
    if (receipt.logs && receipt.logs.length > 0) {
      const iface = new Interface(MUSIC_NFT_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === 'MasterMinted') {
            tokenId = Number(parsed.args[0]);
            break;
          }
        } catch (e) {}
      }
    }

    console.log('✅ Music Master NFT minted!', { tokenId, txHash: tx.hash, price: price || '0.01' });

    if (fid) {
      try {
        const castText = `🎵 New Music Master NFT Minted! Token #${tokenId}\n\n💰 License Price: ${price || '0.01'} ETH\n⚡ Free minting powered by EmpowerTours\n🎶 Purchase license to stream\n\nView: https://testnet.monadscan.com/tx/${tx.hash}`;

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
      } catch (castError) {
        console.warn('⚠️ Cast failed:', castError);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      tokenId,
      recipient,
      tokenURI: finalTokenURI,
      price: price || '0.01',
    });
  } catch (error: any) {
    console.error('❌ Mint error:', error);
    return NextResponse.json(
      { error: error.message || 'Mint failed' },
      { status: 500 }
    );
  }
}
