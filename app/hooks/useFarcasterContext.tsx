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
          // Not in Farcaster environment - this is expected in development
          console.warn('⚠️ Not in Farcaster environment (expected outside Warpcast)');
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        if (!isMounted) return;
        setContext(ctx);
        setError(null);

        // 🔥 CRITICAL: Fetch VERIFIED custody address from Neynar API (with caching)
        const cacheKey = `neynar_wallet_${ctx.user.fid}`;
        const cachedWallet = sessionStorage.getItem(cacheKey);

        if (cachedWallet) {
          console.log('✅ [5/5] Using cached wallet address:', cachedWallet);
          setCustodyAddress(cachedWallet);
          setWalletConnected(true);
          setContext(prev =>
            prev ? { ...prev, user: { ...prev.user, custody_address: cachedWallet } } : null
          );
          setLoading(false);
          return;
        }

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
                sessionStorage.setItem(cacheKey, address); // Cache for session
                setCustodyAddress(address);
                setWalletConnected(true);

                // Update context with the real address AND profile data from Neynar
                setContext(prev =>
                  prev ? {
                    ...prev,
                    user: {
                      ...prev.user,
                      custody_address: address,
                      // ✅ Add pfpUrl and displayName from Neynar
                      pfpUrl: userData.pfp_url || prev.user?.pfpUrl,
                      pfp_url: userData.pfp_url || prev.user?.pfp_url,
                      displayName: userData.display_name || prev.user?.displayName,
                      display_name: userData.display_name || prev.user?.display_name,
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

    try {
      // Debug: Log all available SDK properties
      console.log('🔍 SDK object keys:', Object.keys(sdk));
      console.log('🔍 SDK.actions:', sdk.actions);
      console.log('🔍 SDK.wallet:', (sdk as any).wallet);
      console.log('🔍 SDK.ethereum:', (sdk as any).ethereum);
      console.log('🔍 window.ethereum:', (window as any).ethereum);

      // ✅ NEW: Check if this is a native MON transfer and use sendToken
      if (!params.data && params.value && params.to && sdk.actions?.sendToken) {
        console.log('📤 Using sdk.actions.sendToken for native MON transfer');

        // Convert value to number if it's a hex string
        let amount = params.value;
        if (typeof amount === 'string' && amount.startsWith('0x')) {
          amount = parseInt(amount, 16);
        }

        const result = await sdk.actions.sendToken({
          address: params.to,
          amount: amount.toString(),
          chainId: params.chainId || 41454, // Monad testnet
        });

        console.log('✅ sendToken result:', result);
        return { transactionHash: result };
      }

      // Check if SDK has wallet.sendTransaction (Farcaster Wallet SDK pattern)
      if ((sdk as any).wallet?.sendTransaction) {
        console.log('📤 Using sdk.wallet.sendTransaction');
        const result = await (sdk as any).wallet.sendTransaction(params);
        return result;
      }

      // Check if SDK has actions.sendTransaction
      if (sdk.actions && typeof (sdk.actions as any).sendTransaction === 'function') {
        console.log('📤 Using sdk.actions.sendTransaction');
        const result = await (sdk.actions as any).sendTransaction(params);
        return result;
      }

      // Try ethereum provider
      const provider = (sdk as any).ethereum || (window as any).ethereum;

      if (provider) {
        console.log('📤 Using Ethereum provider');

        // Format parameters for eth_sendTransaction
        const txParams = {
          from: custodyAddress || context?.user?.custody_address,
          to: params.to,
          data: params.data,
          value: params.value || '0x0',
          chainId: params.chainId ? '0x' + params.chainId.toString(16) : undefined,
        };

        console.log('📝 Transaction params:', txParams);

        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        console.log('✅ Transaction hash:', hash);
        return { transactionHash: hash };
      }

      // No method available
      throw new Error(
        'No transaction sending method available. ' +
        'Farcaster mini-apps may not support direct wallet transactions. ' +
        'Available SDK methods: ' + Object.keys(sdk.actions || {}).join(', ')
      );
    } catch (error: any) {
      console.error('❌ Send transaction error:', error);
      throw error;
    }
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
