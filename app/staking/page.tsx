'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ✨ CONSOLIDATED STAKING EXPERIENCE
// This page redirects to /passport-staking because:
// 1. Everyone using the app has a passport (required by PassportGate)
// 2. Passport staking provides SAME yield + credit score benefits
// 3. No reason to stake without passport - you'd miss out on benefits!

export default function StakingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to passport-staking page
    router.replace('/passport-staking');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-6xl mb-4">🎫</div>
        <p className="text-gray-600 text-lg">Redirecting to Passport Staking...</p>
      </div>
    </div>
  );
}
