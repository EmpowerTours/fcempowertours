'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function ClientNav() {
  const router = useRouter();
  const { user, walletAddress, isLoading, error, requestWallet } = useFarcasterContext();
  const farcasterUsername = user?.username;

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

  const navigateTo = (path: string) => {
    router.push(path);
  };

  return (
    <nav className="bg-gray-800 p-4 sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateTo('/')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Home
            </button>
            
            {/* ✅ NEW: Music Discovery Link */}
            <button
              onClick={() => navigateTo('/discover')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              🔍 Discover
            </button>
            
            <button
              onClick={() => navigateTo('/music')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Music
            </button>
            
            <button
              onClick={() => navigateTo('/dashboard')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Dashboard
            </button>
            
            <button
              onClick={() => navigateTo('/passport')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Passport
            </button>
            
            <button
              onClick={() => navigateTo('/market')}
              className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Market
            </button>
            
            {user && (
              <button
                onClick={() => navigateTo('/profile')}
                className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Profile
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="text-white text-sm">Loading...</div>
            ) : error || !user ? (
              <div className="text-red-400 text-sm">Not in Farcaster</div>
            ) : (
              <div className="flex items-center gap-2">
                {user.pfpUrl && (
                  <img 
                    src={user.pfpUrl} 
                    alt="Profile" 
                    className="rounded-full"
                    style={{
                      width: '24px',
                      height: '24px',
                      minWidth: '24px',
                      minHeight: '24px',
                      maxWidth: '24px',
                      maxHeight: '24px',
                      objectFit: 'cover'
                    }}
                  />
                )}
                <div className="flex flex-col text-sm">
                  {farcasterUsername && (
                    <span className="text-white">{`@${farcasterUsername}`}</span>
                  )}
                  {walletAddress && (
                    <span className="text-gray-400 text-xs">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
