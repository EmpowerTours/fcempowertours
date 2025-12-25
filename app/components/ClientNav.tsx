'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function ClientNav() {
  const router = useRouter();
  const { user, walletAddress, isLoading, error, requestWallet } = useFarcasterContext();
  const farcasterUsername = user?.username;
  const [activeTab, setActiveTab] = useState('/');

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

  const navigateTo = (path: string) => {
    setActiveTab(path);
    router.push(path);
  };

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/nft', label: 'Create', icon: '➕' },
    { path: '/lottery', label: 'Lottery', icon: '🎰' },
    { path: '/swap', label: 'Swap', icon: '💱' },
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/passport', label: 'Mint', icon: '✈️' },
  ];

  return (
    <motion.nav
      className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 sticky top-0 z-50 shadow-2xl backdrop-blur-lg"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="container mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {navItems.map((item, index) => (
              <motion.button
                key={item.path}
                onClick={() => navigateTo(item.path)}
                className={`relative px-4 py-2 rounded-lg transition-all overflow-hidden ${
                  activeTab === item.path ? 'text-white' : 'text-gray-400'
                }`}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {activeTab === item.path && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg"
                    layoutId="activeTab"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </motion.button>
            ))}

            <AnimatePresence>
              {user && (
                <motion.button
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  onClick={() => navigateTo('/profile')}
                  className={`relative px-4 py-2 rounded-lg transition-all ${
                    activeTab === '/profile' ? 'text-white' : 'text-gray-400'
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {activeTab === '/profile' && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg"
                      layoutId="activeTab"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1">
                    <span>👤</span>
                    <span className="hidden sm:inline">Profile</span>
                  </span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-white text-sm flex items-center gap-2"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    ⏳
                  </motion.div>
                  Loading...
                </motion.div>
              ) : error || !user ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="text-red-400 text-sm bg-red-900/20 px-3 py-1 rounded-full"
                >
                  Not in Farcaster
                </motion.div>
              ) : (
                <motion.div
                  key="user"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 bg-gray-700/50 rounded-full px-3 py-1 backdrop-blur-sm"
                >
                  {user.pfpUrl && (
                    <motion.img
                      src={user.pfpUrl}
                      alt="Profile"
                      className="rounded-full ring-2 ring-purple-500"
                      style={{
                        width: '32px',
                        height: '32px',
                        minWidth: '32px',
                        minHeight: '32px',
                        maxWidth: '32px',
                        maxHeight: '32px',
                        objectFit: 'cover'
                      }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    />
                  )}
                  <div className="flex flex-col text-sm">
                    {farcasterUsername && (
                      <motion.span
                        className="text-white font-medium"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        @{farcasterUsername}
                      </motion.span>
                    )}
                    {walletAddress && (
                      <motion.span
                        className="text-gray-400 text-xs"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
