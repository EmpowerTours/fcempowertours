'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ✨ CONSOLIDATED STAKING EXPERIENCE
// Redirect to /profile where users can access their passport staking

export default function StakingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to profile page where passport staking is available
    router.replace('/profile');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-6xl mb-4">💰</div>
        <p className="text-gray-600 text-lg">Redirecting to Profile for Staking...</p>
      </div>
    </div>
  );
}
