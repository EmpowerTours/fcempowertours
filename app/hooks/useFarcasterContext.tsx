'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

type ExtendedUserContext = {
  custody_address?: string;
  custodyAddress?: string;
  wallet?: { address?: string };
  walletAddress?: string;
  verified_addresses?: {
    eth_addresses?: string[];
  };
  verifiedAddresses?: {
    ethAddresses?: string[];
  };
  fid?: number;
  [key: string]: any;
};

type ExtendedFarcasterContext = {
  user?: ExtendedUserContext;
  wallet?: { address?: string };
  address?: string;
  client?: {
    clientFid?: string | number;
    platformType?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

type WalletLinkedAccount = {
  type: 'wallet';
  address: string;
  chainType?: string;
  [key: string]: any;
};

function isWalletAccount(account: any): account is WalletLinkedAccount {
  return (
    account &&
    typeof account === 'object' &&
    account.type === 'wallet' &&
    typeof account.address === 'string'
  );
}

export function useFarcasterContext() {
  const [context, setContext] = useState<ExtendedFarcasterContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdk, setSdk] = useState<any>(null);

  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
    login: privyLogin,
    connectWallet
  } = usePrivy();

  // Load Farcaster SDK context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const { sdk: farcasterSdk } = await import('@farcaster/miniapp-sdk');
        setSdk(farcasterSdk);

        const ctx: ExtendedFarcasterContext = await farcasterSdk.context;
        setContext(ctx);
        setError(null);

        console.log('🔍 Farcaster SDK Context:', ctx);
        console.log('👤 Farcaster User:', ctx?.user);
      } catch (err) {
        console.error('❌ Failed to load Farcaster context:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, []);

  // ❌ REMOVED: Auto-login logic that was causing unwanted popups
  // Privy login should only happen when explicitly requested by the user

  const requestWallet = async () => {
    if (!privyReady) {
      console.warn('Privy not ready');
      return null;
    }

    try {
      if (!privyAuthenticated) {
        console.log('🔑 Logging in with Privy...');
        await privyLogin();
      } else {
        console.log('🔑 Connecting wallet with Privy...');
        await connectWallet();
      }
      return privyUser;
    } catch (error) {
      console.error('❌ Failed to request wallet:', error);
      return null;
    }
  };

  const sendTransaction = async (params: any) => {
    if (!sdk) throw new Error('SDK not loaded');
    return await sdk.actions.sendTransaction(params);
  };

  const switchChain = async (params: { chainId: number }) => {
    if (!sdk) throw new Error('SDK not loaded');
    return await sdk.actions.switchChain(params);
  };

  const getWalletAddress = (): string | null => {
    // Priority 1: Privy embedded wallet (only if user explicitly connected)
    if (privyAuthenticated && privyUser?.wallet?.address) {
      console.log('✅ Found wallet via Privy embedded:', privyUser.wallet.address);
      return privyUser.wallet.address;
    }

    // Priority 2: Privy linked wallets (only if user explicitly connected)
    if (privyAuthenticated && Array.isArray(privyUser?.linkedAccounts)) {
      const walletAccount = privyUser.linkedAccounts.find(isWalletAccount) as WalletLinkedAccount | undefined;
      if (walletAccount?.address) {
        console.log('✅ Found linked wallet via Privy:', walletAccount.address);
        return walletAccount.address;
      }
    }

    // Priority 3: Farcaster SDK custody address (default for read-only operations)
    if (context?.user?.custody_address) {
      console.log('✅ Using Farcaster custody address:', context.user.custody_address);
      return context.user.custody_address;
    }

    console.warn('⚠️ No wallet address found');
    return null;
  };

  const walletAddress = getWalletAddress();
  const isMobile = context?.client?.platformType === 'mobile';

  return {
    context,
    loading: loading || !privyReady,
    isLoading: loading || !privyReady,
    error,
    user: context?.user || null,
    walletAddress,
    isMobile,
    requestWallet,
    sendTransaction,
    switchChain,
    sdk,
    privyAuthenticated,
    privyUser,
  };
}
