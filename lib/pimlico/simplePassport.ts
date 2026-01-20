import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createSmartAccountClient } from 'permissionless';
import { http, encodeFunctionData } from 'viem';
import { publicClient, monadTestnet, createPimlicoClientForMonad } from './config';
import PassportNFTABI from '../abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as `0x${string}`;

export async function mintPassportWithPimlico(recipientAddress: string, countryCode: string) {
  console.log('🚀 Starting Pimlico Gasless Passport Mint...');
  
  // 1. Generate a temporary owner account
  console.log('Generating temporary owner account...');
  const ownerPrivateKey = generatePrivateKey();
  const owner = privateKeyToAccount(ownerPrivateKey);
  console.log('✅ Owner account created:', owner.address);

  // 2. Create Pimlico bundler client
  const pimlicoClient = createPimlicoClientForMonad();
  console.log('✅ Pimlico client connected');

  try {
    // 3. Create MetaMask Smart Account
    console.log('Creating MetaMask Smart Account...');
    const smartAccount = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Hybrid,
      deployParams: [owner.address, [], [], []],
      deploySalt: '0x',
      signer: owner as any, // Type cast to bypass strict typing
    });
    console.log('✅ Smart account created at:', smartAccount.address);

    // 4. Create smart account client with Pimlico paymaster
    console.log('Creating smart account client with paymaster...');
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: monadTestnet,
      bundlerTransport: http(pimlicoClient.transport.url),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    });
    console.log('✅ Smart account client created');

    // 5. Encode the mint call
    const mintCallData = encodeFunctionData({
      abi: PassportNFTABI,
      functionName: 'mint',
      args: [recipientAddress, countryCode],
    });

    // 6. Send the gasless transaction
    console.log('Sending gasless mint transaction...');
    const userOpHash = await smartAccountClient.sendUserOperation({
      calls: [{
        to: PASSPORT_NFT_ADDRESS,
        data: mintCallData,
        value: 0n,
      }],
    });
    console.log('✅ UserOp sent:', userOpHash);

    // 7. Wait for the transaction to be mined
    console.log('Waiting for transaction confirmation...');
    const receipt = await smartAccountClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });
    console.log('✅ Transaction confirmed:', receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };
  } catch (error: any) {
    console.error('❌ Pimlico mint failed:', error);
    throw new Error(error.message || 'Gasless mint failed');
  }
}
