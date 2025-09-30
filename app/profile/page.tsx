'use client';

import { sdk } from '@farcaster/miniapp-sdk';

export default function ProfilePage() {
  const fid = sdk.user?.fid || 'Not logged in';
  return (
    <div style={{ padding: '20px' }}>
      <h1>Profile</h1>
      <p>FID: {fid}</p>
    </div>
  );
}
