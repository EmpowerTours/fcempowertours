'use client';

import { useState, useEffect } from 'react';
import { WagmiConfig, useReadContract } from 'wagmi';
import { Abi, defineChain } from 'viem';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import farcaster from '@farcaster/miniapp-wagmi-connector';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';
import MusicNFTABI from '../../lib/abis/MusicNFT.json';

// Configure Wagmi
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID';
const monadChain = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MONAD', symbol: 'MONAD', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
});

const wagmiConfig = defaultWagmiConfig({
  chains: [monadChain],
  projectId,
  metadata: { name: 'EmpowerTours', description: 'Travel Itinerary Marketplace', url: 'https://yourapp.com', icons: ['https://yourapp.com/icon.png'] },
  connectors: [farcaster()],
});

createWeb3Modal({ wagmiConfig, projectId });

const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b';
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS || '0xYOUR_MUSIC_NFT_ADDRESS';

export default function PassportPage() {
  const [passports, setPassports] = useState<{ id: bigint; name: string }[]>([]);

  const { data: passportData } = useReadContract({
    address: PASSPORT_NFT_ADDRESS as `0x${string}`,
    abi: PassportNFTABI as Abi,
    functionName: 'balanceOf',
    args: ['0xYOUR_USER_ADDRESS'], // Replace with actual user address or use useAccount
  });

  useEffect(() => {
    if (passportData) {
      // Fetch token IDs based on balance (simplified)
      setPassports([{ id: BigInt(1), name: 'Sample Passport' }]); // Adjust based on actual data
    }
  }, [passportData]);

  return (
    <WagmiConfig config={wagmiConfig}>
      <div style={{ padding: '20px' }}>
        <h1>Your Passports</h1>
        {passports.length ? (
          <ul>
            {passports.map((passport) => (
              <li key={passport.id.toString()}>Passport #{passport.id.toString()}</li>
            ))}
          </ul>
        ) : (
          <p>No passports found.</p>
        )}
      </div>
    </WagmiConfig>
  );
}
