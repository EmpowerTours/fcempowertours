'use client';

import React, { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function ProfilePage() {
  const [fid, setFid] = useState<string>('Not logged in');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContext() {
      try {
        const context = await sdk.context;
        setFid(context.user?.fid?.toString() || 'Not logged in');
      } catch (error) {
        console.error('Error fetching context:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchContext();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}><p>Loading...</p></div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Profile</h1>
      <p>FID: {fid}</p>
    </div>
  );
}
