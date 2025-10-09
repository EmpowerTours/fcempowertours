'use client';
import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import miniappSdk from '@farcaster/miniapp-sdk';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

interface PassportForm {
  countryCode: string;
  countryName: string;
  manualFid?: string;
}

export default function PassportPage() {
  const { address: userAddress } = useAccount();
  const { authenticated, ready, user, login } = usePrivy();
  const { sendTransaction } = usePrivy();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [form, setForm] = useState<PassportForm>({ countryCode: '', countryName: '', manualFid: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const loginAttempted = useRef(false);

  const isWarpcast = navigator.userAgent.includes('warpcast');

  useEffect(() => {
    const init = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(MONAD_RPC);
        const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
        setProvider(provider);
        setContract(passportContract);
        console.log('Contract initialized:', PASSPORT_NFT_ADDRESS);
      } catch (err: any) {
        console.error('Contract init failed:', err.message || err);
        setError('Failed to initialize contract');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) {
      console.log('Privy not ready');
      return;
    }
    console.log('Privy state:', {
      ready,
      authenticated,
      user,
      fid: user?.farcaster?.fid,
      wallet: user?.wallet?.address,
      isWarpcast,
    });

    const countryCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('country='))
      ?.split('=')[1];
    if (countryCookie) {
      const countryName = countryCookie === 'MX' ? 'Mexico' : countryCookie;
      setForm((prev) => ({ ...prev, countryCode: countryCookie, countryName }));
      setAutoDetected(true);
      console.log('Country from cookie:', countryCookie);
      return;
    }
    if (!navigator.geolocation) {
      console.log('Geolocation not supported');
      setError('Geolocation not supported, please enter country manually');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          console.log('Detected coords:', { latitude, longitude });
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
          );
          const data = await response.json();
          if (data && data.address) {
            const countryCode = data.address.country_code?.toUpperCase() || '';
            const countryName = data.address.country || '';
            setForm((prev) => ({ ...prev, countryCode, countryName }));
            setAutoDetected(true);
            console.log('Auto-detected country:', { countryCode, countryName });
          } else {
            setError('No country data found, please enter manually');
          }
        } catch (err: any) {
          console.error('Geocode failed:', err.message || err);
          setError('Auto-detection failed, please enter manually');
        }
      },
      (err) => {
        console.log('Geolocation denied:', err);
        setError('Location access denied, please enter country manually');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
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
        try {
          console.log('Initiating Farcaster login...', { isWarpcast });
          await login();
          console.log('Farcaster login completed');
        } catch (err: any) {
          console.error('Login error:', err.message || err);
          setLoginError(`Farcaster login failed: ${err.message || 'Unknown error'}`);
        }
      };
      performLogin();
    }
  }, [ready, authenticated, login]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setAutoDetected(name !== 'countryCode' && name !== 'countryName' ? autoDetected : false);
  };

  const handleLogin = async () => {
    console.log('Forcing Farcaster login', { isWarpcast });
    try {
      await login();
      console.log('Farcaster login completed');
    } catch (err: any) {
      console.error('Login error:', err.message || err);
      setLoginError(`Farcaster login failed: ${err.message || 'Unknown error'}`);
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
      setError('Please enter country details');
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
          value: ethers.parseEther("0.01"),
        });
        console.log('Tx sent:', tx.hash);
        const receipt = await provider.waitForTransaction(tx.hash);
        if (!receipt) {
          throw new Error('Transaction receipt not found');
        }
        if (receipt.status !== 1) {
          throw new Error('Mint transaction reverted');
        }
        const tokenId = receipt.logs
          .map((log: any) => contract.interface.parseLog(log))
          .find((log: any) => log?.name === 'Transfer' && log.args.from === ethers.ZeroAddress)?.args.tokenId;
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
      console.error('Mint error:', err.message || err);
      setError(`Mint failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Mint Your Travel Passport NFT</h1>
      {ready && authenticated && userAddress ? (
        <p>Wallet: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}</p>
      ) : (
        <button onClick={handleLogin} style={{ padding: '10px 20px', margin: '10px' }}>
          Connect with Farcaster
        </button>
      )}
      {loginError && <p style={{ color: 'red' }}>Login Error: {loginError}</p>}
      <h2>{autoDetected ? 'Detected Location:' : 'Enter Country Details:'}</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {autoDetected && <p style={{ color: 'green' }}>Auto-filled from your location!</p>}
      <form>
        <input
          type="text"
          name="countryCode"
          placeholder="Country Code (e.g., MX)"
          value={form.countryCode}
          onChange={handleInputChange}
          style={{ margin: '10px', padding: '8px', width: '200px' }}
          maxLength={2}
        />
        <input
          type="text"
          name="countryName"
          placeholder="Country Name (e.g., Mexico)"
          value={form.countryName}
          onChange={handleInputChange}
          style={{ margin: '10px', padding: '8px', width: '300px' }}
        />
        <input
          type="text"
          name="manualFid"
          placeholder="Enter FID manually (if login fails)"
          value={form.manualFid}
          onChange={handleInputChange}
          style={{ margin: '10px', padding: '8px', width: '200px' }}
        />
      </form>
      <button
        onClick={handleMint}
        disabled={!ready || isLoading || !form.countryCode || !form.countryName || (!user?.farcaster?.fid && !form.manualFid)}
        style={{ padding: '10px 20px', margin: '10px' }}
      >
        {isLoading ? 'Minting...' : 'Mint Passport'}
      </button>
      <button
        onClick={() => console.log('Debug Privy:', { ready, authenticated, user, fid: user?.farcaster?.fid })}
        style={{ padding: '10px 20px', margin: '10px', background: '#ccc' }}
      >
        Debug Privy State
      </button>
      <p><small>Uses browser location (HTTPS only). Fallback to manual FID entry if login fails.</small></p>
    </div>
  );
}
