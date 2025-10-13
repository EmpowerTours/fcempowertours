'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import TokenSwapABI from '../../lib/abis/TokenSwap.json';
import { sdk } from '@farcaster/miniapp-sdk';

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA' as const;

export default function AdminPage() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { data: owner } = useReadContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'owner',
  });
  const { data: exchangeRate } = useReadContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'exchangeRate',
  });
  const { data: minMon } = useReadContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'minMon',
  });

  const [newRate, setNewRate] = useState('');
  const [newMin, setNewMin] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (address && owner) {
      setIsOwner(address.toLowerCase() === String(owner).toLowerCase());
    }
  }, [address, owner]);

  if (!isMounted) return <div>Loading...</div>;

  if (!isOwner) {
    return <div>Admin access restricted to owner.</div>;
  }

  const setExchangeRate = useCallback(async () => {
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'setExchangeRate',
        args: [parseEther(newRate)],
      });
      try {
        const context = await sdk.context;
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Updated TokenSwap rate to ${newRate} $TOURS/MON. Tx: ${hash} https://testnet.monadscan.com/tx/${hash}`,
            fid: context.user?.fid || Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }
    } catch (err) {
      console.error('Set exchange rate error:', String(err));
      alert(`Failed to set exchange rate: ${String(err)}`);
    }
  }, [writeContractAsync, newRate]);

  const setMinMon = useCallback(async () => {
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'setMinMon',
        args: [parseEther(newMin)],
      });
      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Updated min MON to ${newMin}. Tx: ${hash} https://testnet.monadscan.com/tx/${hash}`,
            fid: Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }
    } catch (err) {
      console.error('Set min MON error:', String(err));
      alert(`Failed to set min MON: ${String(err)}`);
    }
  }, [writeContractAsync, newMin]);

  const withdrawMon = useCallback(async () => {
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'withdrawMon',
      });
      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Withdrew MON from TokenSwap. Tx: ${hash} https://testnet.monadscan.com/tx/${hash}`,
            fid: Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }
    } catch (err) {
      console.error('Withdraw MON error:', String(err));
      alert(`Failed to withdraw MON: ${String(err)}`);
    }
  }, [writeContractAsync]);

  const withdrawTours = useCallback(async () => {
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'withdrawTours',
        args: [parseEther(withdrawAmount)],
      });
      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Withdrew ${withdrawAmount} $TOURS from TokenSwap. Tx: ${hash} https://testnet.monadscan.com/tx/${hash}`,
            fid: Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }
    } catch (err) {
      console.error('Withdraw TOURS error:', String(err));
      alert(`Failed to withdraw TOURS: ${String(err)}`);
    }
  }, [writeContractAsync, withdrawAmount]);

  return (
    <div className="min-h-screen flex flex-col">
      <div style={{ padding: '20px' }}>
        <h1>TokenSwap Admin</h1>
        <p>Current Rate: {((Number(exchangeRate) / 1e18) || 0).toFixed(0)} $TOURS/MON</p>
        <p>Current Min MON: {((Number(minMon) / 1e18) || 0).toFixed(2)}</p>
        <div>
          <input placeholder="New Rate (e.g., 100)" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
          <button onClick={setExchangeRate}>Set Rate</button>
        </div>
        <div>
          <input placeholder="New Min MON (e.g., 0.01)" value={newMin} onChange={(e) => setNewMin(e.target.value)} />
          <button onClick={setMinMon}>Set Min</button>
        </div>
        <button onClick={withdrawMon}>Withdraw All MON</button>
        <div>
          <input placeholder="Withdraw TOURS Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
          <button onClick={withdrawTours}>Withdraw TOURS</button>
        </div>
      </div>
    </div>
  );
}
