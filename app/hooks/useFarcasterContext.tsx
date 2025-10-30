'use client';

import { useEffect, useState } from 'react';

type ExtendedUserContext = {
  custody_address?: string;
  custodyAddress?: string;
  fid?: number;
  username?: string;
  pfpUrl?: string;
  [key: string]: any;
};

type ExtendedFarcasterContext = {
  user?: ExtendedUserContext;
  client?: {
    clientFid?: string | number;
    platformType?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

export function useFarcasterContext() {
  const [context, setContext] = useState<ExtendedFarcasterContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdk, setSdk] = useState<any>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [custodyAddress, setCustodyAddress] = useState<string | null>(null);

  // Load Farcaster SDK context and fetch real custody address
  useEffect(() => {
    let isMounted = true;

    const loadContext = async () => {
      try {
        console.log('🔄 [1/5] Importing Farcaster SDK...');
        const farcasterModule = await import('@farcaster/miniapp-sdk');
        const { sdk: farcasterSdk } = farcasterModule;

        if (!farcasterSdk) {
          throw new Error('SDK import returned undefined');
        }

        console.log('✅ [2/5] SDK imported successfully');

        if (!isMounted) return;
        setSdk(farcasterSdk);

        console.log('🔄 [3/5] Waiting for SDK to be ready...');

        let attempts = 0;
        let sdkReady = false;
        let ctx: ExtendedFarcasterContext | null = null;

        while (attempts < 10 && !sdkReady) {
          try {
            ctx = await farcasterSdk.context;

            if (ctx && ctx.user && ctx.user.fid) {
              console.log('✅ [4/5] Context loaded!');
              console.log('👤 User:', ctx.user);
              sdkReady = true;
            } else {
              console.warn(`⏳ Attempt ${attempts + 1}: Context not ready`);
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (contextErr) {
            console.warn(`⏳ Attempt ${attempts + 1}: Error fetching context`, contextErr);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (!ctx || !ctx.user) {
          throw new Error('Failed to load Farcaster context');
        }

        if (!isMounted) return;
        setContext(ctx);
        setError(null);

        // 🔥 CRITICAL: Fetch VERIFIED custody address from Neynar API
        console.log('🔄 [5/5] Fetching verified custody address from Neynar for FID:', ctx.user.fid);

        try {
          const neynarResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk?fids=${ctx.user.fid}`,
            {
              headers: {
                'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
              },
            }
          );

          if (neynarResponse.ok) {
            const neynarData = await neynarResponse.json();
            const userData = neynarData.users?.[0];

            if (userData) {
              console.log('📦 Neynar user data:', userData);
              console.log('📋 verifiedAddresses:', userData.verifiedAddresses);
              console.log('📋 verified_addresses:', userData.verified_addresses);

              // 🔥 IMPORTANT: Prioritize primary address, then verified addresses
              let address =
                userData.verified_addresses?.primary?.eth_address ||
                userData.verifiedAddresses?.primary?.eth_address ||
                userData.verified_addresses?.eth_addresses?.[0] ||
                userData.verifiedAddresses?.eth_addresses?.[0] ||
                userData.verifiedAddresses?.ethAddresses?.[0];

              if (address) {
                console.log('✅ Found VERIFIED wallet address:', address);
                setCustodyAddress(address);
                setWalletConnected(true);

                // Update context with the real address
                setContext(prev =>
                  prev ? {
                    ...prev,
                    user: {
                      ...prev.user,
                      custody_address: address
                    }
                  } : null
                );
              } else {
                console.warn('⚠️ No verified addresses found in Neynar data');
                console.log('📋 Available keys:', Object.keys(userData));
                // Fallback: use custody_address if no verified address
                if (userData.custody_address) {
                  console.log('⚠️ Falling back to custody_address:', userData.custody_address);
                  setCustodyAddress(userData.custody_address);
                  setWalletConnected(true);
                }
              }
            }
          } else {
            console.warn('⚠️ Neynar API returned:', neynarResponse.status);
          }
        } catch (neynarErr) {
          console.warn('⚠️ Neynar fetch failed:', neynarErr);
          setWalletConnected(true);
        }

        // Signal to Farcaster that app is ready
        try {
          await farcasterSdk.actions.ready();
          console.log('✅ Ready signal sent');
        } catch (readyError) {
          console.warn('⚠️ Ready signal failed:', readyError);
        }

      } catch (err) {
        console.error('❌ Failed to initialize Farcaster SDK:', err);
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadContext();

    return () => {
      isMounted = false;
    };
  }, []);

  const requestWallet = async () => {
    console.log('🔑 requestWallet() called');

    if (!context?.user) {
      console.warn('⚠️ No user context');
      return null;
    }

    try {
      // Wallet is already connected via Farcaster context
      if (custodyAddress) {
        console.log('✅ Wallet already connected:', custodyAddress);
        setWalletConnected(true);
        return context.user;
      }

      if (context.user.fid) {
        console.log('✅ User authenticated via Farcaster FID:', context.user.fid);
        setWalletConnected(true);
        return context.user;
      }

      throw new Error('No FID or custody address available');

    } catch (error) {
      console.error('❌ Wallet request failed:', error);
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
    // Priority 1: Custody address from Neynar
    if (custodyAddress) {
      return custodyAddress;
    }

    // Priority 2: Direct custody_address from SDK context
    if (context?.user?.custody_address) {
      return context.user.custody_address;
    }

    // Priority 3: camelCase variant
    if (context?.user?.custodyAddress) {
      return context.user.custodyAddress;
    }

    return null;
  };

  const walletAddress = getWalletAddress();
  const isMobile = context?.client?.platformType === 'mobile';

  return {
    context,
    loading,
    isLoading: loading,
    error,
    user: context?.user || null,
    walletAddress,
    custodyAddress,
    isMobile,
    walletConnected,
    requestWallet,
    sendTransaction,
    switchChain,
    sdk,
    fid: context?.user?.fid,
  };
}
