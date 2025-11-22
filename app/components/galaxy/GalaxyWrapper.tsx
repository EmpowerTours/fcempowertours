'use client';

import dynamic from 'next/dynamic';

// Dynamically import GalaxyClient to avoid SSR issues with Three.js
const GalaxyClient = dynamic(
  () => import('./GalaxyClient').then((mod) => mod.GalaxyClient),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ background: '#0a0a1a' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full animate-pulse"
            style={{ background: 'linear-gradient(135deg, #836EF9, #A855F7)' }}
          />
          <p style={{ color: '#a0a0a0' }}>Loading Galaxy...</p>
        </div>
      </div>
    ),
  }
);

export function GalaxyWrapper() {
  return <GalaxyClient />;
}
