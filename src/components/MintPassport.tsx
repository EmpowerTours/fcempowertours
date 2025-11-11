'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePassportNFT } from '../hooks/usePassportNFT';
import { toast } from 'sonner';

export function MintPassport() {
  const { address } = useAccount();
  const { mint, isPending, isConfirming, isConfirmed, useMintPrice } = usePassportNFT();

  const { data: mintPrice } = useMintPrice();

  const [formData, setFormData] = useState({
    name: '',
    country: '',
    pfp: '',
    bio: '',
    metadataUri: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!formData.name || !formData.country) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      mint(
        address,
        formData.name,
        formData.country,
        formData.pfp,
        formData.bio,
        formData.metadataUri
      );
      toast.success('Minting passport...');
    } catch (error) {
      console.error('Error minting passport:', error);
      toast.error('Failed to mint passport');
    }
  };

  if (isConfirmed) {
    toast.success('Passport minted successfully!');
  }

  return (
    <Card className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Mint EmpowerTours Passport</h2>

      {mintPrice ? (
        <p className="text-sm text-gray-600 mb-4">
          Mint Price: {mintPrice.toString()} TOURS
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Your name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Country *</label>
          <Input
            type="text"
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            placeholder="Country code (e.g., US)"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Profile Picture URL</label>
          <Input
            type="text"
            value={formData.pfp}
            onChange={(e) => setFormData({ ...formData, pfp: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <Input
            type="text"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder="Tell us about yourself"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Metadata URI</label>
          <Input
            type="text"
            value={formData.metadataUri}
            onChange={(e) => setFormData({ ...formData, metadataUri: e.target.value })}
            placeholder="ipfs://..."
          />
        </div>

        <Button
          type="submit"
          disabled={isPending || isConfirming || !address}
          className="w-full"
        >
          {isPending || isConfirming ? 'Minting...' : 'Mint Passport'}
        </Button>
      </form>
    </Card>
  );
}
