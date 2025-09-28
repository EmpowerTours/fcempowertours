'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toast';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [itineraryPrompt, setItineraryPrompt] = useState('');
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const router = useRouter();

  useEffect(() => {
    setTimeout(() => setLoading(false), 2000);
  }, []);

  const handleItinerarySubmit = async () => {
    if (!itineraryPrompt) return;
    toast({ title: 'Generating itinerary...', description: 'Please wait.' });
    router.push(`/itinerary?prompt=${encodeURIComponent(itineraryPrompt)}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Image src="/images/splash.png" width={200} height={200} alt="EmpowerTours Splash" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <Image
        src="/images/hero.png"
        width={1200}
        height={630}
        alt="EmpowerTours Hero"
        className="w-full rounded-lg"
      />
      <h1 className="text-3xl font-bold text-green-800 text-center">Welcome to EmpowerTours</h1>
      <p className="text-center text-gray-600">Plan AI-powered trips, mint NFTs, and pool funds for travel!</p>

      <div className="space-y-4">
        {!isConnected ? (
          <Button onClick={() => connect({ connector: connectors[0] })} className="w-full bg-blue-500">
            Connect Wallet
          </Button>
        ) : (
          <p className="text-center text-green-600">Connected: {address.slice(0, 6)}...{address.slice(-4)}</p>
        )}

        <div className="flex space-x-2">
          <Input
            placeholder="E.g., Plan a Paris trip with rock climbing"
            value={itineraryPrompt}
            onChange={(e) => setItineraryPrompt(e.target.value)}
          />
          <Button onClick={handleItinerarySubmit} disabled={!itineraryPrompt}>Generate</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Mint Travel Stamps</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Collect NFTs for your adventures on Monad testnet.</p>
              <Button variant="outline" onClick={() => router.push('/passport')}>
                View Passport
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Join Group Pools</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Fund trips together with TandaTours bot.</p>
              <Button variant="outline" onClick={() => router.push('/market')}>
                Explore Pools
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
