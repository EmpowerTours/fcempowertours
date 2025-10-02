'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Abi, defineChain } from 'viem';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

export const dynamic = 'force-dynamic';  // Runtime-only; skips prerender issues

// Static address
const PASSPORT_NFT_ADDRESS = '0x92d5a2b741b411988468549a5f117174a1ac8d7b' as `0x${string}`;

function ConnectButton() {
  // This sub-component uses the hook only when rendered (client-side, after init)
  const { open } = useWeb3Modal();
  return (
    <button
      onClick={() => open({ view: 'Connect' })}
      style={{ marginLeft: 8, padding: '4px 8px', background: '#0070f3', color: 'white', border: 'none', borderRadius: 4 }}
    >
      Connect
    </button>
  );
}

export default function PassportPage() {
  const [passports, setPassports] = useState<{ id: bigint; name: string }[]>([]);
  const [_mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();  // Hooks at top!

  // useReadContract at top (enabled skips if no address)
  const { data: balance } = useReadContract({
  address: PASSPORT_NFT_ADDRESS,
  abi: PassportNFTABI as Abi,
  functionName: 'balanceOf',
  args: [address || '0x0000000000000000000000000000000000000000'],
  query: { enabled: !!address && isConnected },  // Nested under query for TS
});

  // Client mount & Web3Modal init
  useEffect(() => {  // Hook at top!
    // Dynamic init (client-only) - setMounted AFTER successful init
    import('@web3modal/wagmi/react').then(({ createWeb3Modal, defaultWagmiConfig }) => {
      import('@farcaster/miniapp-wagmi-connector').then(({ farcasterMiniApp }) => {  // Change to farcasterMiniApp
        const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_WALLET_CONNECT_PROJECT_ID';
        const monadChain = defineChain({
          id: 10143,
          name: 'Monad',
          nativeCurrency: { name: 'MONAD', symbol: 'MONAD', decimals: 18 },
          rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'] } },
          blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
        });
        const wagmiConfig = defaultWagmiConfig({
          chains: [monadChain],
          projectId,
          metadata: {
            name: 'EmpowerTours',
            description: 'Travel Itinerary Marketplace',
            url: process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app',
            icons: []
          },
           connectors: [farcasterMiniApp()],  // Call as function: farcasterMiniApp()
        });
        createWeb3Modal({ wagmiConfig, projectId });
        setMounted(true);  // Set mounted ONLY after createWeb3Modal succeeds
      }).catch(console.error);
    }).catch(console.error);
  }, []);  // Empty deps: Runs once on mount

  // Update passports on balance change
useEffect(() => {  // Another hook at top!
  if (balance && (balance as bigint) > BigInt(0)) {  // Cast to bigint
    // Generate sample IDs (expand with tokenOfOwnerByIndex loop for real)
    setPassports(Array.from({ length: Number(balance as bigint) }, (_, i) => ({  // Cast here too
      id: BigInt(i + 1),
      name: `Passport #${i + 1}`,
    })));
  } else {
    setPassports([]);
  }
}, [balance]);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Your Passports</h1>
      {!isConnected ? (
        <p>Connect wallet to view passports.
          {_mounted ? (
            <ConnectButton />
          ) : (
            <span style={{ marginLeft: 8 }}>Loading...</span>
          )}
        </p>
      ) : passports.length ? (
        <ul>
          {passports.map((passport) => (
            <li key={passport.id.toString()}>{passport.name}</li>
          ))}
        </ul>
      ) : (
        <p>No passports found. <button onClick={() => { /* Mint logic here */ }}>Mint One!</button></p>
      )}
    </div>
  );
}
