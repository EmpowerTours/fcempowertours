'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAccount } from 'wagmi';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

interface PassportForm {
  countryCode: string;
  countryName: string;
}

export default function PassportPage() {
  const { address: userAddress } = useAccount();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [form, setForm] = useState<PassportForm>({ countryCode: '', countryName: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState('');

  // Initialize contract
  useEffect(() => {
    const init = async () => {
      const provider = new ethers.JsonRpcProvider(MONAD_RPC);
      const passportContract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
      setContract(passportContract);
    };
    init();
  }, []);

  // Auto-detect location on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      console.log('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          console.log('Detected coords:', { latitude, longitude });

          // Reverse geocode to country via free Nominatim API
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

            // Optional: Auto-trigger mint if wallet connected
            if (userAddress && countryCode) {
              await handleMint();
            }
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 } // 5min cache
    );
  }, [userAddress]);

  // Manual form change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setAutoDetected(false); // Reset if manual edit
  };

  // Mint passport
  const handleMint = async () => {
    if (!contract || !userAddress || !form.countryCode || !form.countryName) {
      setError('Please connect wallet and enter country details');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Call your existing API for metadata/IPFS
      const mintResponse = await fetch('/api/mint-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: form.countryCode,
          countryName: form.countryName,
          userAddress, // Pass if needed for ownership
        }),
      });

      if (!mintResponse.ok) {
        throw new Error(`API Error: ${mintResponse.status}`);
      }

      const { uri } = await mintResponse.json(); // Assume API returns { uri: 'ipfs://...' }
      console.log('Metadata URI:', uri);

      // Sign and mint
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []); // Ensure connected
      const signer = await provider.getSigner();
      const contractWithSigner = contract.connect(signer);

      console.log('Estimating gas...');
      const gasEstimate = await contractWithSigner.mint.estimateGas(uri);
      console.log('Gas estimate:', gasEstimate.toString());

      const tx = await contractWithSigner.mint(uri, { gasLimit: gasEstimate * 120n / 100n }); // 20% buffer
      console.log('Tx sent:', tx.hash);

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        alert(`Passport minted! Token ID: ${receipt.logs?.length || 'Check explorer'}`);
      } else {
        throw new Error('Mint failed - transaction reverted');
      }
    } catch (err: any) {
      console.error('Mint error:', err);
      setError(`Mint failed: ${err.message || err.reason || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Mint Your Travel Passport NFT</h1>
      {userAddress ? <p>Wallet: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}</p> : <p>Please connect wallet</p>}

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
        disabled={!userAddress || isLoading || (!form.countryCode && !form.countryName)}
        style={{ padding: '10px 20px', margin: '10px' }}
      >
        {isLoading ? 'Minting...' : 'Mint Passport'}
      </button>

      <p><small>Uses browser location (HTTPS only). Fallback to manual entry.</small></p>
    </div>
  );
}
