'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function ProfilePage() {
  const { address } = useAccount();
  const [anonymizeLocation, setAnonymizeLocation] = useState(false);

  return (
    <div className="p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile & Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>FID: {window.farcaster ? window.farcaster.user.fid : 'Not logged in'}</p>
          <p>Wallet: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}</p>
          <div className="flex items-center space-x-2">
            <Switch
              checked={anonymizeLocation}
              onCheckedChange={setAnonymizeLocation}
            />
            <span>Anonymize location in shares</span>
          </div>
          <Button variant="outline">Manage Consents</Button>
        </CardContent>
      </Card>
    </div>
  );
}
