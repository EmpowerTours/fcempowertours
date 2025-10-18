import { privateKeyToAccount } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createSmartAccountClient } from 'permissionless';
import { http, type Hex, encodeFunctionData } from 'viem';
import { publicClient, monadTestnet, createPimlicoClientForMonad } from './config';
import MusicNFT from '../abis/MusicNFT.json';

// Create user's smart account (delegator)
export async function createUserSmartAccount(userPrivateKey: Hex) {
  const owner = privateKeyToAccount(userPrivateKey);
  const pimlicoClient = createPimlicoClientForMonad();
  
  console.log('Creating MetaMask Smart Account for:', owner.address);
  
  // Create MetaMask Smart Account
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    deploySalt: '0x',
    signer: { account: owner }, // Changed from signatory to signer
  });
  
  console.log('✅ Smart Account Address:', smartAccount.address);
  
  // Create smart account client with Pimlico paymaster
  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain: monadTestnet,
    bundlerTransport: http(`https://api.pimlico.io/v2/monad-testnet/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
    paymaster: pimlicoClient, // Pimlico sponsors gas!
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  });
  
  return { smartAccount, smartAccountClient };
}

// Mint Music NFT via smart account (GASLESS!)
export async function mintMusicNFTGasless(
  smartAccountClient: any,
  recipient: `0x${string}`,  // Fixed type
  metadataURI: string
) {
  const musicNFTAddress = '0x61A9d192b577EE197Db153753bAD5A93a772eB52' as `0x${string}`;
  
  console.log('Minting Music NFT (gasless)...');
  console.log('Recipient:', recipient);
  console.log('Metadata:', metadataURI);
  
  const txHash = await smartAccountClient.sendTransaction({
    to: musicNFTAddress,
    data: encodeFunctionData({
      abi: MusicNFT,
      functionName: 'mint',
      args: [recipient, metadataURI],
    }),
    value: 0n,
  });
  
  console.log('✅ Music NFT minted! Tx:', txHash);
  return txHash;
}

// Mint Passport NFT via smart account (GASLESS!)
export async function mintPassportNFTGasless(
  smartAccountClient: any,
  recipient: `0x${string}`  // Fixed type
) {
  const passportNFTAddress = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4' as `0x${string}`;
  
  console.log('Minting Passport NFT (gasless)...');
  
  const txHash = await smartAccountClient.sendTransaction({
    to: passportNFTAddress,
    data: encodeFunctionData({
      abi: [
        {
          "inputs": [{"internalType": "address", "name": "to", "type": "address"}],
          "name": "mintPassport",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ],
      functionName: 'mintPassport',
      args: [recipient],
    }),
    value: 0n,
  });
  
  console.log('✅ Passport NFT minted! Tx:', txHash);
  return txHash;
}
