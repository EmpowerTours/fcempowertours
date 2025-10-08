'use client';
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers'; // Correct ethers v6 import
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import PassportNFTABI from '../../lib/abis/PassportNFT.json';

const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';

export default function PassportPage() {
  const { address: userAddress } = useAccount();
  const router = useRouter();
  const [passportContract, setPassportContract] = useState<ethers.Contract | null>(null);
  const [ownedPassports, setOwnedPassports] = useState<bigint[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');

  const getUserLocation = useCallback(async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      return { countryCode: data.country_code, countryName: data.country_name };
    } catch (error) {
      console.error('Error fetching location:', error);
      return { countryCode: 'MX', countryName: 'Mexico' }; // Fallback
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
        const contract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PassportNFTABI, provider);
        setPassportContract(contract);
        if (userAddress) {
          await fetchOwnedPassports(contract, userAddress);
        }
        const { countryCode, countryName } = await getUserLocation();
        setCountryCode(countryCode);
        setCountryName(countryName);
      } catch (error) {
        console.error('Error initializing contract:', error);
      }
    };
    if (window.ethereum) init();
  }, [userAddress, getUserLocation]);

  const fetchOwnedPassports = async (contract: ethers.Contract, userAddress: string) => {
    try {
      const filter = contract.filters.Transfer(null, userAddress);
      const events = await contract.queryFilter(filter, 0, 'latest') as (ethers.Log | ethers.EventLog)[];
      const tokenIds = events
        .filter((event): event is ethers.EventLog => 'args' in event && !!event.args)
        .filter((event: ethers.EventLog) => event.args.to.toLowerCase() === userAddress.toLowerCase())
        .map((event: ethers.EventLog) => event.args.tokenId)
        .filter((id: ethers.BigNumberish): id is bigint => id != null);
      setOwnedPassports([...new Set(tokenIds)]);
    } catch (error) {
      console.error('Error fetching owned passports:', error);
    }
  };

  const mintPassport = async () => {
    try {
      const metadataRes = await fetch('/api/upload-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: countryCode || 'MX', countryName: countryName || 'Mexico' }),
      });
      const { tokenURI } = await metadataRes.json();
      if (!tokenURI) throw new Error('Metadata generation failed');
      const mintRes = await fetch('/api/mint-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: 1368808, // empowertoursbot FID for testing
          countryCode: countryCode || 'MX',
          countryName: countryName || 'Mexico',
          tokenURI,
        }),
      });
      const mintData = await mintRes.json();
      if (mintData.error) throw new Error(mintData.error);
      alert(`Passport minted! Token ID: ${mintData.tokenId}`);
      if (passportContract && userAddress) {
        await fetchOwnedPassports(passportContract, userAddress);
      }
    } catch (error: any) {
      console.error('Error minting passport:', error);
      alert('Failed to mint passport: ' + error.message);
    }
  };

  return (
    <div style={containerStyle}>
      <nav>
        <button onClick={() => router.push('/passport')} className="text-blue-500">Passport</button>
        <button onClick={() => router.push('/music')} className="text-blue-500">Music</button>
        <button onClick={() => router.push('/market')} className="text-blue-500">Market</button>
        <button onClick={() => router.push('/profile')} className="text-blue-500">Profile</button>
      </nav>
      <h1>EmpowerTours Passport</h1>
      {userAddress ? (
        <p>Connected: {userAddress}</p>
      ) : (
        <button onClick={() => window.ethereum.request({ method: 'eth_requestAccounts' })}>
          Connect Wallet
        </button>
      )}
      <h2>Mint Passport</h2>
      <input
        type="text"
        placeholder="Country Code (e.g., MX)"
        value={countryCode}
        onChange={(e) => setCountryCode(e.target.value)}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="Country Name (e.g., Mexico)"
        value={countryName}
        onChange={(e) => setCountryName(e.target.value)}
        style={inputStyle}
      />
      <button onClick={mintPassport} disabled={!userAddress} style={buttonStyle}>
        Mint Passport
      </button>
      <h2>Your Passports</h2>
      {ownedPassports.length > 0 ? (
        <ul>
          {ownedPassports.map((tokenId) => (
            <li key={tokenId.toString()}>Passport NFT #{tokenId.toString()}</li>
          ))}
        </ul>
      ) : (
        <p>No passports owned</p>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '20px',
  maxWidth: '800px',
  margin: '0 auto',
};
const inputStyle: React.CSSProperties = {
  margin: '10px',
  padding: '5px',
};
const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  margin: '5px',
};
