'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import sdk from '@farcaster/miniapp-sdk';

interface FarcasterAppSetupProps {
  onComplete: () => void;
}

export default function FarcasterAppSetup({ onComplete }: FarcasterAppSetupProps) {
  const [isAdded, setIsAdded] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [error, setError] = useState('');
  const [isAddingApp, setIsAddingApp] = useState(false);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

  // Check initial status
  useEffect(() => {
    checkAppStatus();
  }, []);

  const checkAppStatus = async () => {
    setIsCheckingStatus(true);
    try {
      // Check if running in Farcaster context
      const context = await sdk.context;

      if (!context) {
        console.log('Not running in Farcaster mini-app context');
        setIsCheckingStatus(false);
        return;
      }

      // Check localStorage for cached status
      const cachedAdded = localStorage.getItem('fc_app_added') === 'true';
      const cachedNotifications = localStorage.getItem('fc_notifications_enabled') === 'true';

      setIsAdded(cachedAdded);
      setNotificationsEnabled(cachedNotifications);

      // If both are done, complete setup
      if (cachedAdded && cachedNotifications) {
        setTimeout(() => onComplete(), 500);
      }
    } catch (err) {
      console.error('Error checking Farcaster app status:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleAddToFarcaster = async () => {
    setIsAddingApp(true);
    setError('');

    try {
      // Request to add the app to user's Farcaster client
      const result = await sdk.actions.addFrame();

      // Check if action was successful
      if (result) {
        setIsAdded(true);
        localStorage.setItem('fc_app_added', 'true');
        console.log('✅ App added to Farcaster');
      } else {
        throw new Error('Failed to add app to Farcaster');
      }
    } catch (err: any) {
      console.error('Error adding app to Farcaster:', err);
      setError(err.message || 'Failed to add app. Please try again.');
    } finally {
      setIsAddingApp(false);
    }
  };

  const handleEnableNotifications = async () => {
    setIsEnablingNotifications(true);
    setError('');

    try {
      // For now, simulate enabling notifications
      // TODO: Use actual Farcaster notification API when available
      setNotificationsEnabled(true);
      localStorage.setItem('fc_notifications_enabled', 'true');
      console.log('✅ Notifications enabled');

      // If both steps are complete, proceed
      if (isAdded) {
        setTimeout(() => onComplete(), 1000);
      }
    } catch (err: any) {
      console.error('Error enabling notifications:', err);
      setError(err.message || 'Failed to enable notifications. Please try again.');
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="text-6xl mb-4"
          >
            🎫
          </motion.div>
          <p className="text-white text-lg">Checking app status...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        {/* Logo/Header */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="text-center mb-8"
        >
          <div className="text-7xl mb-4">🌍</div>
          <h1 className="text-4xl font-bold text-white mb-2">EmpowerTours</h1>
          <p className="text-gray-300">Travel the world, collect passports</p>
        </motion.div>

        {/* Setup Steps */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 space-y-4">
          <h2 className="text-2xl font-bold text-white text-center mb-4">
            Welcome! Let's get started
          </h2>

          {/* Step 1: Add to Farcaster */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={`p-4 rounded-lg border-2 transition-all ${
              isAdded
                ? 'bg-green-500/20 border-green-500'
                : 'bg-purple-500/20 border-purple-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-3xl">
                  {isAdded ? '✅' : '1️⃣'}
                </div>
                <div>
                  <h3 className="text-white font-semibold">Add to Farcaster</h3>
                  <p className="text-gray-300 text-sm">
                    {isAdded ? 'App added successfully!' : 'Add EmpowerTours to your Farcaster'}
                  </p>
                </div>
              </div>
            </div>

            {!isAdded && (
              <button
                onClick={handleAddToFarcaster}
                disabled={isAddingApp}
                className="w-full mt-3 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {isAddingApp ? '⏳ Adding...' : '➕ Add to Farcaster'}
              </button>
            )}
          </motion.div>

          {/* Step 2: Enable Notifications */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className={`p-4 rounded-lg border-2 transition-all ${
              notificationsEnabled
                ? 'bg-green-500/20 border-green-500'
                : isAdded
                ? 'bg-blue-500/20 border-blue-500'
                : 'bg-gray-500/20 border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-3xl">
                  {notificationsEnabled ? '✅' : '2️⃣'}
                </div>
                <div>
                  <h3 className="text-white font-semibold">Enable Notifications</h3>
                  <p className="text-gray-300 text-sm">
                    {notificationsEnabled
                      ? 'Notifications enabled!'
                      : 'Stay updated with travel rewards'}
                  </p>
                </div>
              </div>
            </div>

            {!notificationsEnabled && isAdded && (
              <button
                onClick={handleEnableNotifications}
                disabled={isEnablingNotifications}
                className="w-full mt-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {isEnablingNotifications ? '⏳ Enabling...' : '🔔 Enable Notifications'}
              </button>
            )}

            {!isAdded && (
              <p className="text-gray-400 text-xs mt-2">
                ⬆️ Complete step 1 first
              </p>
            )}
          </motion.div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 bg-red-500/20 border border-red-500 rounded-lg"
              >
                <p className="text-red-200 text-sm">⚠️ {error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success State */}
          {isAdded && notificationsEnabled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-green-500/20 border-2 border-green-500 rounded-lg text-center"
            >
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-green-200 font-semibold">All set! Loading EmpowerTours...</p>
            </motion.div>
          )}

          {/* Info */}
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-blue-200 text-xs">
              💡 These permissions allow you to mint passports and receive travel reward notifications!
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
