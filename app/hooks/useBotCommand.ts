'use client';

import { useCallback, useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export type BotCommandResponse = {
  success: boolean;
  action?: 'info' | 'navigate' | 'transaction' | 'buy_music' | 'redirect' | 'open_url';
  path?: string;
  url?: string; // For redirect/open_url action
  message?: string;
  txHash?: string;
  tokenId?: string | number;
  error?: string;
};

export function useBotCommand() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ USE EXISTING useFarcasterContext HOOK
  const { fid, walletAddress, isLoading: contextLoading, custodyAddress } = useFarcasterContext();

  const executeCommand = useCallback(
    async (
      command: string,
      options?: {
        location?: { latitude: number; longitude: number };
        fid?: number | string;
        imageUrl?: string;  // For music minting - direct cover image URL
        title?: string; // NFT title (works for both music and art)
        tokenURI?: string;  // For music minting - token metadata URI
        is_art?: boolean;  // Art vs Music flag for conditional cast posting
        collectorTokenURI?: string; // Collector edition token URI
        collectorPrice?: string; // Collector edition price in WMON
        maxEditions?: string; // Max collector editions
      }
    ): Promise<BotCommandResponse> => {
      setLoading(true);
      setError(null);

      try {
        // Get wallet address from Farcaster context only
        const userAddress = walletAddress;

        if (!userAddress) {
          const err = 'Wallet not connected. Please connect your Farcaster wallet.';
          console.warn('❌ [BOT-HOOK] No wallet address found from Farcaster context');
          setError(err);
          return { success: false, error: err};
        }

        console.log('✅ [BOT-HOOK] Wallet address found:', { userAddress, fid });

        const response = await fetch('/api/bot-command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            command,
            userAddress,
            location: options?.location,
            fid: options?.fid || fid,
            imageUrl: options?.imageUrl,
            title: options?.title,
            tokenURI: options?.tokenURI,
            is_art: options?.is_art,
            collectorTokenURI: options?.collectorTokenURI,
            collectorPrice: options?.collectorPrice,
            maxEditions: options?.maxEditions,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error || errorData.message || 'Command failed';
          setError(errorMessage);
          return { success: false, error: errorMessage };
        }

        const data: BotCommandResponse = await response.json();

        if (!data.success) {
          setError(data.message || 'Unknown error');
        }

        return data;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to execute command';
        setError(errorMessage);
        console.error('❌ [BOT-HOOK] Command error:', err);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fid, walletAddress, custodyAddress]
  );

  return {
    executeCommand,
    loading,
    error,
    fid,
    walletAddress,
    contextLoading,
  };
}
