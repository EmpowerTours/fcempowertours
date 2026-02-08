'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface SwipeNavigationProps {
  children: ReactNode;
}

export default function SwipeNavigation({ children }: SwipeNavigationProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const { user } = useFarcasterContext();
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);

  // Normalize pathname - treat /discover as / (they show same content)
  const pathname = rawPathname === '/discover' ? '/' : rawPathname;

  // Disable swipe navigation on oracle page - it has its own gesture controls
  const isOraclePage = rawPathname === '/oracle';

  // Define page order - only use routes that actually exist
  const getPageOrder = () => {
    // / = Home (same as discover)
    // /nft = Create NFT page
    // /dashboard = User Dashboard
    // /passport = Passport Minting
    const basePages = ['/', '/nft', '/dashboard', '/passport'];
    if (user) {
      return [...basePages, '/profile'];
    }
    return basePages;
  };

  useEffect(() => {
    // Only enable on mobile/touch devices
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    // Disable on oracle page
    if (isOraclePage) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore if touching input, textarea, or buttons
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('audio')
      ) {
        return;
      }

      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;
      const deltaX = touchCurrentX - touchStartX.current;
      const deltaY = touchCurrentY - touchStartY.current;

      // Check if it's a horizontal swipe (not vertical scroll)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        // Prevent default only for horizontal swipes
        e.preventDefault();

        const pageOrder = getPageOrder();
        const currentIndex = pageOrder.indexOf(pathname);
        const maxSwipe = 100;

        // Calculate progress (0 to 1)
        const progress = Math.min(Math.abs(deltaX) / maxSwipe, 1);
        setSwipeProgress(progress);

        // Determine direction and check if navigation is possible
        if (deltaX > 0 && currentIndex > 0) {
          setSwipeDirection('right');
        } else if (deltaX < 0 && currentIndex < pageOrder.length - 1) {
          setSwipeDirection('left');
        } else {
          setSwipeDirection(null);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;
      const deltaTime = Date.now() - (touchStartTime.current || 0);

      // Calculate velocity (pixels per millisecond)
      const velocity = Math.abs(deltaX) / deltaTime;

      // Check if it's a valid swipe (horizontal, sufficient distance and velocity)
      if (
        Math.abs(deltaX) > Math.abs(deltaY) &&
        Math.abs(deltaX) > 80 &&
        velocity > 0.3
      ) {
        const pageOrder = getPageOrder();
        const currentIndex = pageOrder.indexOf(pathname);

        let targetPage: string | null = null;

        // Swipe right - go to previous page
        if (deltaX > 0 && currentIndex > 0) {
          targetPage = pageOrder[currentIndex - 1];
        }
        // Swipe left - go to next page
        else if (deltaX < 0 && currentIndex < pageOrder.length - 1) {
          targetPage = pageOrder[currentIndex + 1];
        }

        if (targetPage) {
          router.push(targetPage);
        }
      }

      // Reset
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
      setSwipeProgress(0);
      setSwipeDirection(null);
    };

    // Add event listeners
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pathname, router, user, isOraclePage]);

  const pageOrder = getPageOrder();
  const currentIndex = pageOrder.indexOf(pathname);

  return (
    <>
      {children}

      {/* Swipe indicators - shown during swipe, hidden on oracle page */}
      <AnimatePresence>
        {!isOraclePage && swipeProgress > 0.1 && swipeDirection && (
          <>
            {/* Left arrow indicator */}
            {swipeDirection === 'right' && currentIndex > 0 && (
              <motion.div
                key="left-indicator"
                initial={{ opacity: 0, scale: 0.5, x: -50 }}
                animate={{
                  opacity: swipeProgress,
                  scale: 0.5 + swipeProgress * 0.5,
                  x: swipeProgress * 20 - 50
                }}
                exit={{ opacity: 0, scale: 0 }}
                className="fixed left-8 top-1/2 -translate-y-1/2 z-[100] pointer-events-none"
              >
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-2xl">
                  <span className="text-3xl text-white">←</span>
                </div>
              </motion.div>
            )}

            {/* Right arrow indicator */}
            {swipeDirection === 'left' && currentIndex < pageOrder.length - 1 && (
              <motion.div
                key="right-indicator"
                initial={{ opacity: 0, scale: 0.5, x: 50 }}
                animate={{
                  opacity: swipeProgress,
                  scale: 0.5 + swipeProgress * 0.5,
                  x: -swipeProgress * 20 + 50
                }}
                exit={{ opacity: 0, scale: 0 }}
                className="fixed right-8 top-1/2 -translate-y-1/2 z-[100] pointer-events-none"
              >
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-2xl">
                  <span className="text-3xl text-white">→</span>
                </div>
              </motion.div>
            )}

            {/* Page indicator dots */}
            <motion.div
              key="page-indicators"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: swipeProgress * 0.9, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
            >
              <div className="flex gap-2 bg-gray-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-2xl border border-gray-700">
                {pageOrder.map((page, index) => (
                  <motion.div
                    key={page}
                    className={`h-2 rounded-full transition-all ${
                      index === currentIndex
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 w-8'
                        : 'bg-gray-500 w-2'
                    }`}
                    animate={{
                      scale: index === currentIndex ? 1.2 : 1
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
