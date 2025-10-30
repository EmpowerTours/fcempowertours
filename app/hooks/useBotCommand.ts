'use client';

import { useCallback, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export type BotCommandResponse = {
  success: boolean;
  action?: 'info' | 'navigate' | 'transaction' | 'buy_music';
  path?: string;
  message?: string;
  txHash?: string;
  tokenId?: string | number;
  error?: string;
};

export function useBotCommand() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = usePrivy();

  // ✅ USE EXISTING useFarcasterContext HOOK
  const { fid, walletAddress, isLoading: contextLoading, custodyAddress } = useFarcasterContext();

  const executeCommand = useCallback(
    async (
      command: string,
      options?: {
        location?: { latitude: number; longitude: number };
        fid?: number | string;
      }
    ): Promise<BotCommandResponse> => {
      setLoading(true);
      setError(null);

      try {
        // ✅ FIXED: Get wallet address from multiple sources
        // Priority: Farcaster context (custodyAddress) → Privy linkedAccounts → Display message

        let userAddress: string | undefined;

        // Step 1: Try Farcaster context first (this is the most reliable via Neynar)
        if (walletAddress) {
          userAddress = walletAddress;
          console.log('✅ [BOT-HOOK] Using wallet from Farcaster context:', userAddress);
        }
        // Step 2: Fallback to Privy linkedAccounts
        else if (user?.linkedAccounts) {
          const walletAcc = user.linkedAccounts.find((acc: any) => acc.type === 'wallet') as any;
          
          if (walletAcc) {
            // Try direct address property first
            if (walletAcc.address) {
              userAddress = walletAcc.address;
            }
            // Try CAIP10 format (eip155:chainId:address)
            else if (walletAcc.caip10Address) {
              const parts = walletAcc.caip10Address.split(':');
              userAddress = parts[2];
            }
          }
          
          if (userAddress) {
            console.log('✅ [BOT-HOOK] Using wallet from Privy:', userAddress);
          }
        }

        // Step 3: If still no address, error
        if (!userAddress) {
          const err = 'Wallet not connected. Please connect your wallet first.';
          console.warn('❌ [BOT-HOOK] No wallet address found.', {
            farcasterWallet: walletAddress,
            custodyAddress: custodyAddress,
            privyUser: user ? 'exists' : 'null',
            privyLinkedAccounts: user?.linkedAccounts?.length || 0
          });
          setError(err);
          return { success: false, error: err };
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
    [user, fid, walletAddress, custodyAddress]
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
