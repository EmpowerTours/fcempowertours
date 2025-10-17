import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createSmartAccountClient } from 'permissionless';
import { http, encodeFunctionData } from 'viem';
import { publicClient, monadTestnet, createPimlicoClientForMonad } from './config';

// Simple gasless passport mint
export async function mintPassportGasless(userAddress: string) {
  console.log('🎫 Starting gasless passport mint for:', userAddress);
  
  // 1. Get or create private key for this user (stored in localStorage for demo)
  let privateKey = localStorage.getItem(`pk_${userAddress}`);
  if (!privateKey) {
    console.log('Generating new private key for user...');
    privateKey = generatePrivateKey();
    localStorage.setItem(`pk_${userAddress}`, privateKey);
    console.log('✅ New private key generated and stored');
  } else {
    console.log('✅ Using existing private key');
  }

  // 2. Create owner account from private key
  const owner = privateKeyToAccount(privateKey as `0x${string}`);
  console.log('Owner address:', owner.address);

  // 3. Create Pimlico client for gas sponsorship
  console.log('Creating Pimlico client...');
  const pimlicoClient = createPimlicoClientForMonad();
  console.log('✅ Pimlico client created');

  // 4. Create MetaMask Smart Account
  console.log('Creating MetaMask Smart Account...');
  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    deploySalt: '0x',
    signer: owner,
  });
  console.log('✅ Smart account created at:', smartAccount.address);

  // 5. Create smart account client with Pimlico paymaster (this makes it GASLESS!)
  console.log('Creating smart account client with paymaster...');
  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain: monadTestnet,
    bundlerTransport: http(`https://api.pimlico.io/v2/monad-testnet/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
    paymaster: pimlicoClient, // Pimlico sponsors the gas!
    userOperation: {
      estimateFeesPerGas: async () => {
        const gasPrice = await pimlicoClient.getUserOperationGasPrice();
        return gasPrice.fast;
      },
    },
  });
  console.log('✅ Smart account client created with Pimlico paymaster');

  // 6. Encode the passport mint function call
  const passportAddress = (process.env.NEXT_PUBLIC_PASSPORT || '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4') as `0x${string}`;
  console.log('Passport contract:', passportAddress);
  
  const mintCalldata = encodeFunctionData({
    abi: [
      {
        inputs: [{ name: 'to', type: 'address' }],
        name: 'mintPassport',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ],
    functionName: 'mintPassport',
    args: [userAddress as `0x${string}`],
  });
  console.log('✅ Mint calldata encoded');

  // 7. Send the gasless transaction!
  console.log('Sending gasless transaction via Pimlico...');
  console.log('⏳ This may take 10-20 seconds...');
  
  const txHash = await smartAccountClient.sendTransaction({
    to: passportAddress,
    data: mintCalldata,
    value: 0n,
  });

  console.log('🎉 SUCCESS! Passport minted (gasless)!');
  console.log('Transaction hash:', txHash);
  console.log('Smart account used:', smartAccount.address);

  return { 
    txHash, 
    smartAccountAddress: smartAccount.address,
    ownerAddress: owner.address 
  };
}
