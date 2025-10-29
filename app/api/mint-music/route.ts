import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface, parseEther } from 'ethers';
// ✅ MusicLicenseNFTv4 with delegation support
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6';
const TOURS_TOKEN_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
// MusicLicenseNFTv4 ABI
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'string', name: 'songTitle', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' }
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { internalType: 'address', name: 'licensee', type: 'address' }
    ],
    name: 'purchaseLicenseFor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' }
    ],
    name: 'purchaseLicense',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'licenseId', type: 'uint256' }
    ],
    name: 'renewLicense',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'uint256', name: 'masterTokenId', type: 'uint256' }
    ],
    name: 'hasValidLicense',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
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
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'licenseId', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'masterTokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'expiry', type: 'uint256' }
    ],
    name: 'LicensePurchased',
    type: 'event',
  },
];
// TOURS ERC20 ABI for approval
const TOURS_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' }
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, tokenURI, metadataCID, metadataCid, price, fid, songTitle } = body;
    let finalTokenURI = tokenURI;
    const cid = metadataCid || metadataCID;
    if (!finalTokenURI && cid) {
      finalTokenURI = `ipfs://${cid}`;
    }
    console.log('🎵 MusicLicenseNFTv4 mint request:', {
      recipient,
      tokenURI: finalTokenURI,
      songTitle: songTitle || 'Untitled',
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
    let priceInWei: bigint;
    try {
      priceInWei = parseEther(price?.toString() || '1');
    } catch (err) {
      console.error('Invalid price format:', price);
      priceInWei = parseEther('1');
    }
    console.log('💰 Price in wei:', priceInWei.toString(), `(${price || '1'} TOURS)`);
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    // ✅ CRITICAL: MusicLicenseNFTv4 does NOT require TOURS payment during mintMaster()
    // Payment is only required during purchaseLicense() or purchaseLicenseFor()
    // The mintMaster function is free for artists to create their master NFTs
    console.log('ℹ️ MusicLicenseNFTv4 does not require TOURS payment during mint');
    console.log(' Payment is collected when users purchase licenses');
    // Create contract instance
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);
    console.log('⚡ Minting music master NFT...');
    console.log(' Artist:', recipient);
    console.log(' Song Title:', songTitle || 'Untitled');
    console.log(' Token URI:', finalTokenURI);
    console.log(' License Price:', price || '1', 'TOURS');
    const tx = await contract.mintMaster(
      recipient,
      finalTokenURI,
      songTitle || 'Untitled',
      priceInWei
    );
    console.log('📤 Mint tx sent:', tx.hash);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }
    // Extract tokenId from MasterMinted event
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
        } catch (e) {
          // Skip logs that don't match
        }
      }
    }
    console.log('✅ Music Master NFT minted!', {
      tokenId,
      txHash: tx.hash,
      price: price || '1',
      songTitle: songTitle || 'Untitled'
    });
    // Post cast via empowertoursbot
    if (fid) {
      try {
        const castText = `🎵 New Music Master NFT Minted! Token #${tokenId}
${songTitle || 'Untitled'}
💰 License Price: ${price || '1'} TOURS
⚡ Free minting powered by EmpowerTours
🎶 Purchase license to stream full track
View: https://testnet.monadscan.com/tx/${tx.hash}
@empowertours`;
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
        console.log('📢 Cast posted successfully');
      } catch (castError) {
        console.warn('⚠️ Cast failed (mint still succeeded):', castError);
      }
    }
    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      tokenId,
      recipient,
      tokenURI: finalTokenURI,
      songTitle: songTitle || 'Untitled',
      price: price || '1',
    });
  } catch (error: any) {
    console.error('❌ Mint error:', error);
    // Provide more detailed error information
    let errorMessage = error.message || 'Mint failed';
    if (error.code === 'CALL_EXCEPTION') {
      errorMessage = 'Contract call failed. Possible reasons:\n';
      errorMessage += '1. Artist already minted a song with this title\n';
      errorMessage += '2. Invalid parameters\n';
      errorMessage += '3. Contract is paused or has restrictions';
    }
    return NextResponse.json(
      {
        error: errorMessage,
        details: error.reason || error.shortMessage,
        code: error.code
      },
      { status: 500 }
    );
  }
}
