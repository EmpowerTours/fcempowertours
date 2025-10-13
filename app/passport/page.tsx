'use client';

import { useState, useEffect, useRef } from 'react';
import { JsonRpcProvider, parseEther, ZeroAddress, Contract } from 'ethers';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { sdk } from '@farcaster/miniapp-sdk';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

interface PassportForm {
  countryCode: string;
  countryName: string;
  manualFid?: string;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

function ClientOnlyPassport() {
  const { address: userAddress } = useAccount();
  const { authenticated, ready, user, login } = usePrivy();
  const { sendTransaction } = usePrivy();
  const [contract, setContract] = useState<Contract | null>(null);
  const [provider, setProvider] = useState<JsonRpcProvider | null>(null);
  const [form, setForm] = useState<PassportForm>({ countryCode: '', countryName: '', manualFid: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContract, setIsLoadingContract] = useState(true);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const loginAttempted = useRef(false);
  const isWarpcast = navigator.userAgent.includes('warpcast');

  useEffect(() => {
    if (isWarpcast) {
      try {
        sdk.actions.ready();
        console.log('Farcaster SDK ready called');
      } catch (err: any) {
        console.error('Farcaster SDK ready error:', String(err.message || err));
      }
    }
  }, [isWarpcast]);

  useEffect(() => {
    const init = async () => {
      setIsLoadingContract(true);
      try {
        const provider = new JsonRpcProvider(MONAD_RPC);
        const passportContract = new Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
        setProvider(provider);
        setContract(passportContract);
        console.log('Contract initialized:', PASSPORT_NFT_ADDRESS);
      } catch (err: any) {
        console.error('Contract init failed:', String(err.message || err));
        setError('Failed to initialize contract');
      } finally {
        setIsLoadingContract(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) {
      console.log('Privy not ready');
      return;
    }
    setIsLoadingAuth(false);
    console.log('Privy state:', {
      ready,
      authenticated,
      user: user ? { fid: user.farcaster?.fid, wallet: user.wallet?.address } : null,
      isWarpcast,
    });

    const countryCookie = getCookie('country');
    if (countryCookie) {
      const countryMap: Record<string, string> = {
        US: 'United States',
        CA: 'Canada',
        GB: 'United Kingdom',
        FR: 'France',
        DE: 'Germany',
      };
      const countryName = countryMap[countryCookie] || countryCookie;
      setForm((prev) => ({ ...prev, countryCode: countryCookie, countryName }));
      setAutoDetected(true);
      console.log('Cookie-detected location:', { countryCode: countryCookie, countryName });
    } else {
      setError('No country data available; using default (US).');
      setForm((prev) => ({ ...prev, countryCode: 'US', countryName: 'United States' }));
      setAutoDetected(true);
    }
  }, [ready]);

  useEffect(() => {
    if (ready && authenticated && user) {
      console.log('Privy updated:', { fid: user.farcaster?.fid, wallet: user.wallet?.address });
      if (!user.farcaster?.fid && !form.manualFid) {
        setError('Farcaster FID not found, please try logging in again or enter FID manually');
      }
    }
  }, [ready, authenticated, user, form.manualFid]);

  useEffect(() => {
    if (ready && !authenticated && !loginAttempted.current) {
      const performLogin = async () => {
        loginAttempted.current = true;
        setIsLoadingAuth(true);
        try {
          console.log('Initiating Farcaster login...', { isWarpcast });
          await login();
          console.log('Farcaster login completed');
        } catch (err: any) {
          console.error('Login error:', String(err.message || err));
          setLoginError(`Farcaster login failed: ${String(err.message || 'Unknown error')}`);
        } finally {
          setIsLoadingAuth(false);
        }
      };
      performLogin();
    }
  }, [ready, authenticated, login]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async () => {
    console.log('Forcing Farcaster login', { isWarpcast });
    setIsLoadingAuth(true);
    try {
      await login();
      console.log('Farcaster login completed');
    } catch (err: any) {
      console.error('Login error:', String(err.message || err));
      setLoginError(`Farcaster login failed: ${String(err.message || 'Unknown error')}`);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleMint = async () => {
    console.log('handleMint called with:', {
      ready,
      authenticated,
      fid: user?.farcaster?.fid || form.manualFid,
      userAddress,
      countryCode: form.countryCode,
      countryName: form.countryName,
      contract: !!contract,
      provider: !!provider,
    });

    if (!ready) {
      setError('App not ready, please wait');
      return;
    }
    if (!authenticated && !form.manualFid) {
      setError('Please log in with Farcaster or enter FID manually');
      handleLogin();
      return;
    }
    if (!user?.farcaster?.fid && !form.manualFid) {
      setError('Farcaster authentication failed: FID not found');
      handleLogin();
      return;
    }
    if (!form.countryCode || !form.countryName) {
      setError('Country details not detected');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (userAddress && contract && provider) {
        console.log('Attempting client-side mint with Privy...');
        const tx = await sendTransaction({
          chainId: 10143,
          to: PASSPORT_NFT_ADDRESS,
          data: contract.interface.encodeFunctionData('mint', [userAddress]),
          value: parseEther("0.01"),
        });
        console.log('Tx sent:', tx.hash);
        const receipt = await provider.waitForTransaction(tx.hash);
        if (!receipt) {
          throw new Error('Transaction receipt not found');
        }
        if (receipt.status !== 1) {
          throw new Error('Transaction receipt failed');
        }
        const tokenId = receipt.logs
          .map((log: any) => contract.interface.parseLog(log))
          .find((log: any) => log?.name === 'Transfer' && log.args.from === ZeroAddress)?.args.tokenId;
        if (!tokenId) {
          throw new Error('Failed to extract tokenId');
        }

        console.log('Calling /api/mint-passport for tokenURI and cast...', { tokenId });
        const mintResponse = await fetch('/api/mint-passport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fid: user?.farcaster?.fid || form.manualFid,
            countryCode: form.countryCode,
            countryName: form.countryName,
            userAddress,
            tokenId: Number(tokenId),
          }),
        });
        if (!mintResponse.ok) {
          throw new Error(`API error: ${mintResponse.status} ${await mintResponse.text()}`);
        }
        const { txHash, tokenURI } = await mintResponse.json();
        alert(`Minted Passport #${tokenId}! Tx: ${txHash}, URI: ${tokenURI}`);
      } else {
        console.log('Client-side mint skipped, falling back to server-side mint...');
        const mintResponse = await fetch('/api/mint-passport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fid: user?.farcaster?.fid || form.manualFid,
            countryCode: form.countryCode,
            countryName: form.countryName,
          }),
        });
        if (!mintResponse.ok) {
          throw new Error(`Server mint failed: ${mintResponse.status} ${await mintResponse.text()}`);
        }
        const { tokenId, txHash, tokenURI } = await mintResponse.json();
        alert(`Minted Passport #${tokenId}! Tx: ${txHash}, URI: ${tokenURI}`);
      }
    } catch (err: any) {
      console.error('Mint error:', String(err.message || err));
      setError(`Mint failed: ${String(err.message || 'Unknown error')}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <h1>Mint Your Travel Passport NFT</h1>
        {isLoadingContract ? (
          <p className="text-gray-500">Loading contract...</p>
        ) : isLoadingAuth ? (
          <p className="text-gray-500">Authenticating with Farcaster...</p>
        ) : ready && authenticated && userAddress ? (
          <p>Wallet: {String(userAddress).slice(0, 6)}...{String(userAddress).slice(-4)}</p>
        ) : (
          <button onClick={handleLogin} style={{ padding: '10px 20px', margin: '10px' }} disabled={isLoadingAuth}>
            {isLoadingAuth ? 'Logging in...' : 'Connect with Farcaster'}
          </button>
        )}
        {loginError && <p style={{ color: 'red' }}>{String(loginError)}</p>}
        {error && <p style={{ color: 'red' }}>{String(error)}</p>}
        {isLoadingContract || isLoadingAuth ? null : autoDetected ? (
          <>
            <h2>Detected Location:</h2>
            <p style={{ color: 'green' }}>Auto-filled from your IP (via cookie)!</p>
            <p><strong>Country Code:</strong> {String(form.countryCode)}</p>
            <p><strong>Country Name:</strong> {String(form.countryName)}</p>
          </>
        ) : (
          <p className="text-gray-500">Detecting location...</p>
        )}
        <form>
          <input
            type="text"
            name="manualFid"
            placeholder="Enter FID manually (if login fails)"
            value={String(form.manualFid || '')}
            onChange={handleInputChange}
            style={{ margin: '10px', padding: '8px', width: '200px' }}
            disabled={isLoading}
          />
        </form>
        <button
          onClick={handleMint}
          disabled={!ready || isLoading || isLoadingContract || isLoadingAuth || !form.countryCode || !form.countryName || (!user?.farcaster?.fid && !form.manualFid)}
          style={{ padding: '10px 20px', margin: '10px' }}
        >
          {isLoading ? 'Minting...' : 'Mint Passport'}
        </button>
        <button
          onClick={() => console.log('Debug Privy:', { ready, authenticated, user: user ? { fid: user.farcaster?.fid } : null, fid: user?.farcaster?.fid })}
          style={{ padding: '10px 20px', margin: '10px', background: '#ccc' }}
        >
          Debug Privy State
        </button>
        <p><small>Detected via IP geolocation cookie. Manual FID fallback if login fails.</small></p>
      </div>
    </div>
  );
}

export default function PassportPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return <div>Loading...</div>;

  return <ClientOnlyPassport />;
}
