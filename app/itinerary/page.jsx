'use client';
import { useState } from 'react';
import { useAccount, useConnect } from 'wagmi';

export default function ItineraryPage() {
    const [itinerary, setItinerary] = useState('');
    const [loading, setLoading] = useState(false);
    const [prompt, setPrompt] = useState('Generate a short travel itinerary description for Paris.');
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();

    const generateItinerary = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/itinerary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setItinerary(data.itinerary);
        } catch (error) {
            console.error('Error:', error.message);
            setItinerary('Failed to generate itinerary');
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>EmpowerTours Itinerary Generator</h1>
            {!isConnected ? (
                <button onClick={() => connect({ connector: connectors[0] })}>
                    Connect Wallet
                </button>
            ) : (
                <p>Connected: {address}</p>
            )}
            <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter itinerary prompt"
                style={{ width: '300px', marginBottom: '10px' }}
            />
            <br />
            <button onClick={generateItinerary} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Itinerary'}
            </button>
            <p>{itinerary}</p>
        </div>
    );
}
