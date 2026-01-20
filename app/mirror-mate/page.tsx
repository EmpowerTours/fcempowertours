'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import PageTransition from '@/app/components/animations/PageTransition';
import Image from 'next/image';

interface Guide {
  id: string;
  fid?: number;
  name: string;
  username?: string;
  age?: number;
  location: string;
  bio: string;
  languages: string[];
  transport?: string[];
  imageUrl: string;
  isCustom: boolean; // Custom uploaded vs Farcaster user
  verifiedAddress?: string;
}

export default function MirrorMatePage() {
  const { user, isLoading: contextLoading } = useFarcasterContext();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Guide[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [holdTimer, setHoldTimer] = useState<NodeJS.Timeout | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  useEffect(() => {
    loadGuides();
  }, []);

  const loadGuides = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/mirror-mate/get-guides');
      const data = await response.json();

      if (data.success) {
        setGuides(data.guides);
      }
    } catch (error) {
      console.error('Failed to load guides:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setCurrentIndex((prev) => prev + 1);
    setHoldProgress(0);
  };

  const handleMatchStart = () => {
    let progress = 0;
    const timer = setInterval(() => {
      progress += 5;
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(timer);
        handleMatch();
      }
    }, 50); // 1 second total hold time

    setHoldTimer(timer);
  };

  const handleMatchEnd = () => {
    if (holdTimer) {
      clearInterval(holdTimer);
      setHoldTimer(null);
    }
    setHoldProgress(0);
  };

  const handleMatch = () => {
    const currentGuide = guides[currentIndex];
    setMatches((prev) => [...prev, currentGuide]);

    // Save match to backend
    saveMatch(currentGuide);

    setCurrentIndex((prev) => prev + 1);
    setHoldProgress(0);
  };

  const saveMatch = async (guide: Guide) => {
    try {
      await fetch('/api/mirror-mate/save-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userFid: user?.fid,
          guideFid: guide.fid,
          guideId: guide.id,
        }),
      });
    } catch (error) {
      console.error('Failed to save match:', error);
    }
  };

  if (contextLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🌍</div>
          <p className="text-white">Finding your perfect travel guides...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="text-center p-8 bg-black/60 backdrop-blur-lg rounded-3xl border border-pink-500/30 max-w-md">
          <div className="text-6xl mb-4">🌍</div>
          <h1 className="text-3xl font-bold text-white mb-4">MirrorMate</h1>
          <p className="text-gray-300 mb-6">
            Find your perfect travel guide from the Farcaster community.
          </p>
          <p className="text-sm text-gray-400">
            This Mini App must be opened in Warpcast.
          </p>
        </div>
      </div>
    );
  }

  // Show matches screen
  if (showMatches) {
    return (
      <PageTransition className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-pink-500/30">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">Your Matches</h2>
              <button
                onClick={() => setShowMatches(false)}
                className="text-gray-400 hover:text-white"
              >
                ← Back
              </button>
            </div>

            {matches.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">💔</div>
                <p className="text-gray-400">No matches yet. Keep swiping!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {matches.map((guide, index) => (
                  <motion.div
                    key={index}
                    className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-xl p-4 border border-pink-500/30"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="relative w-full h-32 mb-3 rounded-lg overflow-hidden">
                      <Image
                        src={guide.imageUrl}
                        alt={guide.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <h3 className="text-white font-bold text-sm mb-1">{guide.name}</h3>
                    <p className="text-gray-400 text-xs">{guide.location}</p>
                    {guide.username && (
                      <p className="text-pink-400 text-xs mt-1">@{guide.username}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowMatches(false)}
              className="w-full mt-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-pink-700 transition-all"
            >
              Continue Matching
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // No more guides
  if (currentIndex >= guides.length) {
    return (
      <PageTransition className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center px-4">
        <div className="max-w-md bg-black/60 backdrop-blur-lg rounded-3xl p-8 border border-pink-500/30 text-center">
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-3xl font-bold text-white mb-4">That's Everyone!</h2>
          <p className="text-gray-300 mb-6">
            You've seen all available guides. Check back later for more!
          </p>

          <button
            onClick={() => setShowMatches(true)}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold mb-4 hover:from-purple-700 hover:to-pink-700 transition-all"
          >
            View Matches ({matches.length})
          </button>

          <button
            onClick={() => {
              setCurrentIndex(0);
              loadGuides();
            }}
            className="w-full py-4 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 transition-all"
          >
            Start Over
          </button>
        </div>
      </PageTransition>
    );
  }

  const currentGuide = guides[currentIndex];

  return (
    <PageTransition className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">🌍 MirrorMate</h1>
          <button
            onClick={() => setShowMatches(true)}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg font-semibold hover:bg-pink-700"
          >
            Matches ({matches.length})
          </button>
        </div>

        {/* Card Stack */}
        <div className="relative h-[600px]">
          <AnimatePresence>
            <motion.div
              key={currentIndex}
              className="absolute inset-0"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ x: -300, opacity: 0, transition: { duration: 0.2 } }}
            >
              <div className="bg-black/60 backdrop-blur-lg rounded-3xl border border-pink-500/30 overflow-hidden h-full flex flex-col">
                {/* Image */}
                <div className="relative h-[400px] bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                  <Image
                    src={currentGuide.imageUrl}
                    alt={currentGuide.name}
                    fill
                    className="object-cover"
                    priority
                  />

                  {/* Hold Progress Indicator */}
                  {holdProgress > 0 && (
                    <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="transform -rotate-90 w-32 h-32">
                          <circle
                            cx="64"
                            cy="64"
                            r="60"
                            stroke="white"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray="377"
                            strokeDashoffset={377 - (377 * holdProgress) / 100}
                            className="transition-all duration-100"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-white text-4xl">❤️</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Badge: Farcaster vs Custom */}
                  <div className="absolute top-4 right-4">
                    {currentGuide.isCustom ? (
                      <div className="px-3 py-1 bg-green-600 rounded-full text-white text-xs font-bold">
                        ✓ Verified Guide
                      </div>
                    ) : (
                      <div className="px-3 py-1 bg-purple-600 rounded-full text-white text-xs font-bold">
                        🟣 Farcaster User
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 flex-1 overflow-y-auto">
                  <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-3xl font-bold text-white">{currentGuide.name}</h2>
                    {currentGuide.age && (
                      <span className="text-xl text-gray-400">{currentGuide.age}</span>
                    )}
                  </div>

                  {currentGuide.username && (
                    <p className="text-pink-400 mb-2">@{currentGuide.username}</p>
                  )}

                  <p className="text-gray-400 mb-4">📍 {currentGuide.location}</p>

                  <p className="text-gray-300 mb-4">{currentGuide.bio}</p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {currentGuide.languages.map((lang, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-blue-600/30 border border-blue-500/50 rounded-full text-blue-200 text-sm"
                      >
                        🗣️ {lang}
                      </span>
                    ))}
                  </div>

                  {currentGuide.transport && currentGuide.transport.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {currentGuide.transport.map((mode, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-purple-600/30 border border-purple-500/50 rounded-full text-purple-200 text-sm"
                        >
                          {mode}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-6 grid grid-cols-2 gap-4">
                  <button
                    onClick={handleSkip}
                    className="py-4 bg-gray-700 text-white rounded-xl font-bold text-lg hover:bg-gray-600 transition-all active:scale-95"
                  >
                    👋 Skip
                  </button>

                  <button
                    onMouseDown={handleMatchStart}
                    onMouseUp={handleMatchEnd}
                    onMouseLeave={handleMatchEnd}
                    onTouchStart={handleMatchStart}
                    onTouchEnd={handleMatchEnd}
                    className="py-4 bg-gradient-to-r from-pink-600 to-red-600 text-white rounded-xl font-bold text-lg hover:from-pink-700 hover:to-red-700 transition-all active:scale-95"
                  >
                    ❤️ Hold to Match
                  </button>
                </div>

                {/* Progress Indicator */}
                <div className="px-6 pb-4">
                  <div className="text-center text-gray-400 text-sm">
                    {currentIndex + 1} / {guides.length}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">
            Tap Skip or Hold ❤️ for 1 second to match with a guide
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
