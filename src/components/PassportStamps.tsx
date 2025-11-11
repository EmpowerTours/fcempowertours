'use client';

import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { usePassportNFT } from '../hooks/usePassportNFT';
import { useState, useEffect } from 'react';

interface PassportData {
  name: string;
  country: string;
  pfp: string;
  bio: string;
  mintTimestamp: bigint;
}

export function PassportStamps() {
  const { address } = useAccount();
  const { useBalanceOf, useGetPassportData } = usePassportNFT();

  const { data: balance } = useBalanceOf(address!);
  const [passports, setPassports] = useState<PassportData[]>([]);

  // For demo purposes, we'll show the first passport if the user has any
  const { data: passportData } = useGetPassportData(balance && balance > 0n ? 0n : 0n);

  useEffect(() => {
    if (passportData) {
      // In a real app, you'd loop through all tokenIds the user owns
      setPassports([passportData as PassportData]);
    }
  }, [passportData]);

  if (!address) {
    return (
      <Card className="p-6 max-w-4xl mx-auto">
        <p className="text-center text-gray-600">
          Connect your wallet to view your passport stamps
        </p>
      </Card>
    );
  }

  if (!balance || balance === 0n) {
    return (
      <Card className="p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Passport Stamps</h2>
        <p className="text-center text-gray-600">
          You don't have any passport NFTs yet. Mint one to get started!
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Your Passport Stamps</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {passports.map((passport, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
            <div className="aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mb-4 flex items-center justify-center">
              {passport.pfp ? (
                <img
                  src={passport.pfp}
                  alt={passport.name}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <div className="text-white text-4xl font-bold">
                  {passport.country}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{passport.name}</h3>
                  <p className="text-sm text-gray-600">{passport.country}</p>
                </div>
                <div className="text-2xl">🛂</div>
              </div>

              {passport.bio && (
                <p className="text-sm text-gray-600 line-clamp-2">
                  {passport.bio}
                </p>
              )}

              <div className="text-xs text-gray-500 pt-2 border-t">
                Minted: {new Date(Number(passport.mintTimestamp) * 1000).toLocaleDateString()}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 mt-6">
        <h3 className="text-xl font-bold mb-4">Collection Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-2xl font-bold">{balance.toString()}</div>
            <div className="text-sm text-gray-600">Total Passports</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{passports.length}</div>
            <div className="text-sm text-gray-600">Countries Visited</div>
          </div>
          <div>
            <div className="text-2xl font-bold">🌍</div>
            <div className="text-sm text-gray-600">Global Traveler</div>
          </div>
          <div>
            <div className="text-2xl font-bold">⭐</div>
            <div className="text-sm text-gray-600">Premium Member</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
