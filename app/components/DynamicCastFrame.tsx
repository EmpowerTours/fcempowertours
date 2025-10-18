'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { motion, AnimatePresence } from 'framer-motion';

interface Cast {
  id: string;
  text: string;
  author: {
    username: string;
    pfp_url?: string;
  };
  embeds?: { url: string }[];
  timestamp: number;
  category?: string;
}

export default function DynamicCastFrame() {
  const { user } = usePrivy();
  const [casts, setCasts] = useState<Cast[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [gestureStart, setGestureStart] = useState<{ x: number; y: number } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ✅ Animation Variants (fixed ease type)
  const borderVariants = {
    animate: {
      rotate: 360,
      transition: {
        repeat: Infinity,
        ease: 'linear', // FIXED for Framer Motion v11+
        duration: 20,
      },
    },
  };

  // Voice recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();

        // Extract categories from speech
        const categories = ['#food', '#accommodation', '#travel', '#music', '#art', '#tech'];
        const detected = categories.filter((cat) => transcript.includes(cat.slice(1)));
        if (detected.length > 0) {
          setActiveCategories(detected);
        }
      };
    }
  }, []);

  // Fetch casts based on categories
  useEffect(() => {
    const fetchCasts = async () => {
      try {
        const params = activeCategories.length > 0 ? `?categories=${activeCategories.join(',')}` : '';
        const res = await fetch(`/api/dynamic-casts${params}`);
        const data = await res.json();

        setCasts((prevCasts) => {
          const newCasts = data.casts.filter(
            (cast: Cast) => !prevCasts.some((existing) => existing.id === cast.id)
          );
          return [...prevCasts, ...newCasts].slice(-50);
        });

        // ✅ FIXED: Set current image from casts with media
        const castsWithMedia = data.casts.filter((c: Cast) => c.embeds && c.embeds.length > 0);
        if (castsWithMedia.length > 0 && castsWithMedia[0].embeds && castsWithMedia[0].embeds[0]) {
          setCurrentImage(castsWithMedia[0].embeds[0].url);
        }
      } catch (error) {
        console.error('Failed to fetch casts:', error);
      }
    };

    fetchCasts();
    const interval = setInterval(fetchCasts, 5000);
    return () => clearInterval(interval);
  }, [activeCategories]);

  // Gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setGestureStart({ x: touch.clientX, y: touch.clientY });
  }, []);

  const handleTouchEnd = useCallback(
    async (e: React.TouchEvent) => {
      if (!gestureStart) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - gestureStart.x;
      const deltaY = touch.clientY - gestureStart.y;

      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      // Bottom-right to top-left: Photo capture
      if (
        gestureStart.x > screenWidth * 0.7 &&
        gestureStart.y > screenHeight * 0.7 &&
        deltaX < -screenWidth * 0.5 &&
        deltaY < -screenHeight * 0.5
      ) {
        await capturePhoto();
      }

      // Bottom-left to top-right: Video recording
      if (
        gestureStart.x < screenWidth * 0.3 &&
        gestureStart.y > screenHeight * 0.7 &&
        deltaX > screenWidth * 0.5 &&
        deltaY < -screenHeight * 0.5
      ) {
        await startVideoRecording();
      }

      setGestureStart(null);
    },
    [gestureStart]
  );

  const capturePhoto = async () => {
    setIsCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);

      canvas.toBlob(async (blob) => {
        if (blob) {
          const formData = new FormData();
          formData.append('image', blob, 'moment.jpg');
          formData.append('collection', 'time-collection');
          formData.append('userId', user?.id || '');

          await fetch('/api/save-moment', {
            method: 'POST',
            body: formData,
          });
        }
      }, 'image/jpeg');

      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error('Photo capture failed:', error);
    }
    setIsCapturing(false);
  };

  const startVideoRecording = async () => {
    console.log('🎥 Starting video recording...');
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
    setIsListening(!isListening);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Animated border (fixed variant) */}
      <motion.div
        className="absolute inset-0 rounded-2xl border-4 border-blue-500/40 pointer-events-none"
        variants={borderVariants}
        animate="animate"
      />

      {/* Floating cast text border */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top edge */}
        <div className="absolute top-0 left-0 right-0 h-16 overflow-hidden">
          <motion.div
            className="flex whitespace-nowrap"
            animate={{ x: [0, -2000] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' as const }}
          >
            {casts.map((cast, i) => (
              <span key={`top-${i}`} className="text-purple-400 text-sm mx-4 opacity-80">
                @{cast.author.username}: {cast.text.slice(0, 100)}...
              </span>
            ))}
          </motion.div>
        </div>

        {/* Bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden">
          <motion.div
            className="flex whitespace-nowrap"
            animate={{ x: [-2000, 0] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' as const }}
          >
            {casts.map((cast, i) => (
              <span key={`bottom-${i}`} className="text-purple-400 text-sm mx-4 opacity-80">
                {cast.category} {cast.text.slice(0, 100)}...
              </span>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Center content area */}
      <div className="absolute inset-16 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentImage ? (
            <motion.img
              key={currentImage}
              src={currentImage}
              alt="Cast media"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <h1 className="text-6xl font-bold text-white mb-4">🎵 EmpowerTours</h1>
              <p className="text-xl text-purple-300">
                {isListening ? '🎤 Listening...' : 'Swipe to capture moments'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Voice control button */}
      <button
        onClick={toggleListening}
        className={`absolute top-20 right-20 p-4 rounded-full transition-all ${
          isListening ? 'bg-red-500 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {isListening ? '🔴' : '🎤'}
      </button>

      {/* Active categories */}
      {activeCategories.length > 0 && (
        <div className="absolute top-20 left-20 bg-black/50 backdrop-blur-sm rounded-lg p-4">
          <p className="text-white text-sm mb-2">Active filters:</p>
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((cat) => (
              <span
                key={cat}
                className="px-3 py-1 bg-purple-600 text-white rounded-full text-xs"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Gesture hints */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 text-center">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-6 py-3">
          <p className="text-purple-300 text-sm">
            📸 Swipe ↖️ for photo | 🎥 Swipe ↗️ for video
          </p>
        </div>
      </div>

      {/* Capture flash indicator */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="absolute inset-0 bg-white pointer-events-none"
            style={{ opacity: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
