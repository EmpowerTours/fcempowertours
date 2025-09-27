'use client';
import { useState } from 'react';
import { useAccount, useConnect, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import PassportNFT from '../../lib/abis/PassportNFT.json';

export default function RockClimbingPage() {
    const [location, setLocation] = useState('');
    const [grade, setGrade] = useState('');
    const { address, isConnected } = useAccount();
    const { writeContract } = useWriteContract();
    const { connect, connectors } = useConnect();

    const mintStamp = async () => {
        if (!location || !grade) return alert('Enter location and grade');
        if (!isConnected) return alert('Connect wallet first');
        try {
            await writeContract({
                address: '0x92D5a2b741b411988468549a5f117174A1aC8D7b',
                abi: PassportNFT,
                functionName: 'mint',
                args: [address, `Rock Climbing: ${location}, Grade: ${grade}`],
                value: parseEther('0'),
            });
            alert('Stamp minted!');
        } catch (error) {
            console.error('Error:', error.message);
            alert('Failed to mint stamp');
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Log Rock Climbing</h1>
            {!isConnected ? (
                <button onClick={() => connect({ connector: connectors[0] })}>
                    Connect Wallet
                </button>
            ) : (
                <p>Connected: {address}</p>
            )}
            <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Climbing location"
                style={{ width: '300px', marginBottom: '10px' }}
            />
            <br />
            <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Climbing grade (e.g., 5.10a)"
                style={{ width: '300px', marginBottom: '10px' }}
            />
            <br />
            <button onClick={mintStamp}>Mint Climbing Stamp</button>
        </div>
    );
}
