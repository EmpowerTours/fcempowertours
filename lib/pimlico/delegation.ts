import { encodeFunctionData, parseEther, type Hex } from 'viem';
import { createCaveat } from '@metamask/delegation-toolkit';

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT as Hex;

// Caveat enforcer addresses on Monad testnet
const ENFORCERS = {
  nativeTokenTransfer: '0x...' as Hex, // Need actual address
  callCount: '0x...' as Hex,
  timeframe: '0x...' as Hex
};

export async function setupMusicMintingDelegation(
  smartAccountClient: any,
  userAddress: Hex,
  config: {
    spendingLimit: string; // in ETH
    maxMints: number;
    durationHours: number;
  }
) {
  const { spendingLimit, maxMints, durationHours } = config;
  
  // Create caveats for the delegation
  const caveats = [
    // Spending limit caveat
    createCaveat(
      ENFORCERS.nativeTokenTransfer,
      parseEther(spendingLimit),
      '0x'
    ),
    // Max number of mints
    createCaveat(
      ENFORCERS.callCount,
      encodeFunctionData({
        abi: [{
          name: 'setMaxCalls',
          type: 'function',
          inputs: [{ name: 'max', type: 'uint256' }],
        }],
        functionName: 'setMaxCalls',
        args: [BigInt(maxMints)]
      }),
      '0x'
    ),
    // Time limit
    createCaveat(
      ENFORCERS.timeframe,
      encodeFunctionData({
        abi: [{
          name: 'setTimeframe',
          type: 'function',
          inputs: [{ name: 'seconds', type: 'uint256' }],
        }],
        functionName: 'setTimeframe',
        args: [BigInt(durationHours * 3600)]
      }),
      '0x'
    )
  ];

  const delegation = {
    delegate: MUSIC_NFT_ADDRESS,
    authority: '0x0000000000000000000000000000000000000000' as Hex,
    caveats,
    salt: BigInt(Date.now())
  };

  // Sign the delegation with the user's smart account
  const signedDelegation = await smartAccountClient.signDelegation(delegation);
  
  // Store delegation in KV for later use
  await fetch('/api/store-delegation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddress,
      delegation: signedDelegation,
      config
    })
  });

  return signedDelegation;
}
