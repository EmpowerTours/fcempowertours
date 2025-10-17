'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parseEther } from 'viem';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import TokenSwapABI from '../../lib/abis/TokenSwap.json';
import { sdk } from '@farcaster/miniapp-sdk';

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA' as const;

// Add authorized admin addresses here (lowercase)
const AUTHORIZED_ADMINS = [
  '0x6d11a83feeefa14ef1b38dce97be3995441c9fec3', // Treasury address (owner)
  '0x7291ed98c8b2830fdeb3a450ade60381952a45fb',
  '0xe67e13d545c76c2b4e28dfe27ad827e1fc18e8d9',
  '0x33ffccb1802e13a7eead232bcd4706a2269582b0',
].map(addr => addr.toLowerCase());

export default function AdminPage() {
  // ========================================
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  // ========================================
  
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (address && owner) {
      // Check if user is contract owner OR in the authorized admins list
      const isContractOwner = address.toLowerCase() === String(owner).toLowerCase();
      const isAuthorizedAdmin = AUTHORIZED_ADMINS.includes(address.toLowerCase());
      setIsAdmin(isContractOwner || isAuthorizedAdmin);
    }
  }, [address, owner]);

  // ========================================
  // ALL useCallback HOOKS - MUST BE HERE BEFORE RETURNS
  // ========================================

  const setExchangeRate = useCallback(async () => {
    if (!newRate) return;
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'setExchangeRate',
        args: [parseEther(newRate)],
      });

      alert(`Exchange rate updated! Tx: ${hash}`);

      try {
        const context = await sdk.context;
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🔧 Updated TokenSwap rate to ${newRate} $TOURS/MON\n\nTx: https://testnet.monadscan.com/tx/${hash}`,
            fid: context.user?.fid || Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }

      setNewRate('');
    } catch (err) {
      console.error('Set exchange rate error:', String(err));
      alert(`Failed to set exchange rate: ${String(err)}`);
    }
  }, [writeContractAsync, newRate]);

  const setMinMon = useCallback(async () => {
    if (!newMin) return;
    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'setMinMon',
        args: [parseEther(newMin)],
      });

      alert(`Min MON updated! Tx: ${hash}`);

      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🔧 Updated min MON to ${newMin}\n\nTx: https://testnet.monadscan.com/tx/${hash}`,
            fid: Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }

      setNewMin('');
    } catch (err) {
      console.error('Set min MON error:', String(err));
      alert(`Failed to set min MON: ${String(err)}`);
    }
  }, [writeContractAsync, newMin]);

  const withdrawMon = useCallback(async () => {
    if (!confirm('Withdraw all MON from the contract?')) return;

    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'withdrawMon',
      });

      alert(`MON withdrawn! Tx: ${hash}`);

      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `💰 Withdrew MON from TokenSwap\n\nTx: https://testnet.monadscan.com/tx/${hash}`,
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
    if (!withdrawAmount) return;
    if (!confirm(`Withdraw ${withdrawAmount} $TOURS from the contract?`)) return;

    try {
      const hash = await writeContractAsync({
        address: TOKEN_SWAP_ADDRESS,
        abi: TokenSwapABI,
        functionName: 'withdrawTours',
        args: [parseEther(withdrawAmount)],
      });

      alert(`$TOURS withdrawn! Tx: ${hash}`);

      try {
        await fetch('/api/neynar-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `💰 Withdrew ${withdrawAmount} $TOURS from TokenSwap\n\nTx: https://testnet.monadscan.com/tx/${hash}`,
            fid: Number(process.env.BOT_FID),
          }),
        });
      } catch (err) {
        console.error('Failed to publish cast:', String(err));
      }

      setWithdrawAmount('');
    } catch (err) {
      console.error('Withdraw TOURS error:', String(err));
      alert(`Failed to withdraw TOURS: ${String(err)}`);
    }
  }, [writeContractAsync, withdrawAmount]);

  // ========================================
  // NOW IT'S SAFE TO DO CONDITIONAL RETURNS
  // ALL HOOKS HAVE BEEN CALLED ABOVE
  // ========================================

  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-400">Admin access restricted to authorized addresses.</p>
          {address && (
            <p className="text-sm text-gray-500 mt-4">
              Your address: {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">TokenSwap Admin Panel</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Settings</h2>
          <div className="space-y-2">
            <p className="text-lg">
              <span className="text-gray-400">Exchange Rate:</span>{' '}
              <span className="font-mono">{((Number(exchangeRate) / 1e18) || 0).toFixed(0)} $TOURS/MON</span>
            </p>
            <p className="text-lg">
              <span className="text-gray-400">Minimum MON:</span>{' '}
              <span className="font-mono">{((Number(minMon) / 1e18) || 0).toFixed(2)} MON</span>
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Set Exchange Rate</h3>
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="New Rate (e.g., 100)"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={setExchangeRate}
                disabled={!newRate}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
              >
                Set Rate
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Set Minimum MON</h3>
            <div className="flex gap-3">
              <input
                type="number"
                step="0.01"
                placeholder="New Min (e.g., 0.01)"
                value={newMin}
                onChange={(e) => setNewMin(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={setMinMon}
                disabled={!newMin}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
              >
                Set Min
              </button>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Withdraw Funds</h3>
            <div className="space-y-3">
              <button
                onClick={withdrawMon}
                className="w-full px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded font-medium"
              >
                Withdraw All MON
              </button>

              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="Amount of TOURS to withdraw"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-yellow-500 focus:outline-none"
                />
                <button
                  onClick={withdrawTours}
                  disabled={!withdrawAmount}
                  className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
