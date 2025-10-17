'use client';

import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

export default function ClientNav() {
  const router = useRouter();
  
  // Add a try-catch to handle potential initialization issues
  let privyData;
  try {
    privyData = usePrivy();
  } catch (error) {
    console.error('Privy initialization error:', error);
    return (
      <nav className="w-full bg-black/90 backdrop-blur-sm p-4 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎵</span>
            <span className="text-white font-bold text-xl">EmpowerTours</span>
          </div>
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </nav>
    );
  }

  const { ready, authenticated, user, login, logout } = privyData;
  const farcasterUsername = user?.farcaster?.username;
  const walletAddress = user?.wallet?.address;

  const navigateTo = (path: string) => {
    router.push(path);
  };

  return (
    <nav className="w-full bg-black/90 backdrop-blur-sm p-4 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <span className="text-white font-bold text-xl">EmpowerTours</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigateTo('/')}
            className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Home
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
          {authenticated && (
            <>
              <button
                onClick={() => navigateTo('/profile')}
                className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Profile
              </button>
              <button
                className="text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Admin
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!ready ? (
            <div className="text-gray-400 text-sm">Loading...</div>
          ) : !authenticated ? (
            <button
              onClick={login}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              Sign in with Farcaster
            </button>
          ) : (
            <>
              <div className="flex flex-col items-end">
                {farcasterUsername && (
                  <span className="text-white text-sm font-medium">{`@${farcasterUsername}`}</span>
                )}
                {walletAddress && (
                  <span className="text-gray-400 text-xs font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                )}
              </div>
              <button
                onClick={logout}
                className="px-4 py-2 text-gray-300 hover:text-white text-sm transition-colors"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
