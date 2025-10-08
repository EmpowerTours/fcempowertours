'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

interface PassportForm {
  countryCode: string;
  countryName: string;
}

export default function PassportPage() {
  const { address: userAddress } = useAccount();
  const { authenticated, ready, user, login } = usePrivy();
  const { sendTransaction } = usePrivy();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const [form, setForm] = useState<PassportForm>({ countryCode: '', countryName: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState('');

  // Initialize contract and provider
  useEffect(() => {
    const init = async () => {
      const provider = new ethers.JsonRpcProvider(MONAD_RPC);
      const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
      setProvider(provider);
      setContract(passportContract);
    };
    init();
  }, []);

  // Auto-detect location or use cookie
  useEffect(() => {
    if (!ready) return;
    // Check cookie first
    const countryCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('country='))
      ?.split('=')[1];
    if (countryCookie) {
      const countryName = countryCookie === 'MX' ? 'Mexico' : countryCookie;
      setForm({ countryCode: countryCookie, countryName });
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
            setForm({ countryCode, countryName });
            setAutoDetected(true);
            console.log('Auto-detected country:', { countryCode, countryName });
          }
        } catch (err) {
          console.error('Geocode failed:', err);
          setError('Auto-detection failed, please enter manually');
        }
      },
      (err) => {
        console.log('Geolocation denied:', err);
        setError('Location access denied, please enter country manually');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, [ready, userAddress]);

  // Manual form change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setAutoDetected(false);
  };

  // Mint passport
  const handleMint = async () => {
    if (!ready || !authenticated) {
      setError('Please log in with Farcaster');
      login();
      return;
    }
    if (!user?.farcaster?.fid) {
      setError('Farcaster authentication failed: FID not found');
      login();
      return;
    }
    if (!form.countryCode || !form.countryName) {
      setError('Please enter country details');
      return;
    }
    if (!userAddress) {
      setError('Please connect your wallet');
      return;
    }
    if (!contract || !provider) {
      setError('Contract or provider not initialized');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Try client-side mint with Privy (user pays 0.01 MON)
      console.log('Attempting client-side mint with Privy...');
      const tx = await sendTransaction({
        chainId: 10143, // Monad testnet
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

      // Call API to set tokenURI (onlyOwner) and post cast
      const mintResponse = await fetch('/api/mint-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: user.farcaster.fid,
          countryCode: form.countryCode,
          countryName: form.countryName,
          userAddress,
          tokenId: Number(tokenId),
        }),
      });
      if (!mintResponse.ok) {
        throw new Error(`API error: ${mintResponse.status}`);
      }
      const { txHash, tokenURI } = await mintResponse.json();
      alert(`Minted Passport #${tokenId}! Tx: ${txHash}, URI: ${tokenURI}`);
    } catch (err: any) {
      console.error('Client mint error:', err);
      // Fallback to server-side mint (deployer pays)
      try {
        console.log('Falling back to server-side mint...');
        const mintResponse = await fetch('/api/mint-passport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fid: user.farcaster.fid,
            countryCode: form.countryCode,
            countryName: form.countryName,
            userAddress,
          }),
        });
        if (!mintResponse.ok) {
          throw new Error(`Server mint failed: ${mintResponse.status}`);
        }
        const { tokenId, txHash, tokenURI } = await mintResponse.json();
        alert(`Minted Passport #${tokenId}! Tx: ${txHash}, URI: ${tokenURI}`);
      } catch (serverErr: any) {
        console.error('Server mint error:', serverErr);
        setError(`Mint failed: ${serverErr.message || 'Unknown error'}`);
      }
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
        <button onClick={login} style={{ padding: '10px 20px', margin: '10px' }}>
          Connect with Farcaster
        </button>
      )}
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
      </form>
      <button
        onClick={handleMint}
        disabled={!ready || !authenticated || !userAddress || isLoading || !form.countryCode || !form.countryName}
        style={{ padding: '10px 20px', margin: '10px' }}
      >
        {isLoading ? 'Minting...' : 'Mint Passport'}
      </button>
      <p><small>Uses browser location (HTTPS only). Fallback to manual entry.</small></p>
    </div>
  );
}
