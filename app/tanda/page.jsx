'use client';
import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import EscrowVault from '../../lib/abis/EscrowVault.json';

export default function TandaPage() {
    const [amount, setAmount] = useState('');
    const { address, isConnected } = useAccount();
    const { writeContract } = useWriteContract();

    const stakeTanda = async () => {
        if (!amount) return alert('Enter amount');
        if (!isConnected) return alert('Connect wallet first');
        try {
            await writeContract({
                address: '0xDd57B4eae4f7285DB943edCe8777f082b2f02f79',
                abi: EscrowVault,
                functionName: 'deposit',
                args: [parseEther(amount)],
            });
            alert('Staked!');
        } catch (error) {
            console.error('Error:', error.message);
            alert('Failed to stake');
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>TandaTours - Micro-Saving & Staking</h1>
            {!isConnected ? <p>Connect wallet to stake</p> : <p>Connected: {address}</p>}
            <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount to stake (e.g., 10)"
                style={{ width: '300px', marginBottom: '10px' }}
            />
            <br />
            <button onClick={stakeTanda}>Stake $TOURS</button>
            <button onClick={() => alert('Coming soon')}>Join Tanda Group</button>
            <button onClick={() => alert('Coming soon')}>Send Remittance</button>
            <button onClick={() => alert('Coming soon')}>Mint Savings NFT</button>
        </div>
    );
}
