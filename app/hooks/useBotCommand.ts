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
  const { fid, walletAddress, isLoading: contextLoading } = useFarcasterContext();

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
        // Priority: Privy linkedAccounts → Farcaster context → Display message
        
        let userAddress: string | undefined;
        
        // Step 1: Try Privy linkedAccounts
        const walletAcc = user?.linkedAccounts?.find((acc: any) => acc.type === 'wallet') as any;
        
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
          // Try chainId:address format (alternative)
          else if (walletAcc.caip10Address && typeof walletAcc.caip10Address === 'string') {
            userAddress = walletAcc.caip10Address;
          }
        }
        
        // Step 2: Fallback to Farcaster context wallet (from SimpleBotBar)
        if (!userAddress && walletAddress) {
          userAddress = walletAddress;
        }
        
        // Step 3: If still no address, error
        if (!userAddress) {
          const err = 'Wallet not connected. Please connect your wallet first.';
          console.warn('❌ [BOT-HOOK] No wallet address found. Privy:', { walletAcc, user }, 'Farcaster:', { walletAddress });
          setError(err);
          return { success: false, error: err };
        }

        console.log('✅ [BOT-HOOK] Wallet address found:', { userAddress, source: walletAcc ? 'Privy' : 'Farcaster' });

        // ✅ USE FID FROM useFarcasterContext
        const commandFid = options?.fid || fid;

        console.log('📤 [BOT-HOOK] Executing command:', {
          command,
          userAddress,
          fid: commandFid,
          location: options?.location,
          source: walletAcc ? 'Privy wallet' : 'Farcaster context'
        });

        const response = await fetch('/api/bot-command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            command,
            userAddress,
            location: options?.location,
            fid: commandFid, // ✅ FID IS NOW SENT!
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
    [user, fid]
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
