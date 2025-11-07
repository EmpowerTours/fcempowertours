'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, ReactNode } from 'react';
import { motion, PanInfo, useAnimation } from 'framer-motion';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface SwipeNavigationProps {
  children: ReactNode;
}

export default function SwipeNavigation({ children }: SwipeNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useFarcasterContext();
  const controls = useAnimation();
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);

  // Define page order
  const getPageOrder = () => {
    const basePages = [
      '/discover',
      '/music',
      '/dashboard',
      '/passport',
      '/market',
    ];

    // Add profile page if user is logged in
    if (user) {
      return [...basePages, '/profile'];
    }

    return basePages;
  };

  // Detect if device is mobile/touch-enabled
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobile = window.innerWidth < 768; // md breakpoint
    setIsSwipeEnabled(isTouchDevice && isMobile);
  }, []);

  const handleDragEnd = (_event: any, info: PanInfo) => {
    const swipeThreshold = 100; // minimum distance for swipe
    const swipeVelocityThreshold = 500; // minimum velocity for swipe

    const { offset, velocity } = info;
    const pageOrder = getPageOrder();
    const currentIndex = pageOrder.indexOf(pathname);

    if (currentIndex === -1) {
      controls.start({ x: 0, opacity: 1 });
      setSwipeProgress(0);
      return;
    }

    let shouldNavigate = false;
    let targetPage = '';

    // Swipe left - go to next page
    if (
      offset.x < -swipeThreshold &&
      velocity.x < -swipeVelocityThreshold &&
      currentIndex < pageOrder.length - 1
    ) {
      shouldNavigate = true;
      targetPage = pageOrder[currentIndex + 1];
    }
    // Swipe right - go to previous page
    else if (
      offset.x > swipeThreshold &&
      velocity.x > swipeVelocityThreshold &&
      currentIndex > 0
    ) {
      shouldNavigate = true;
      targetPage = pageOrder[currentIndex - 1];
    }

    if (shouldNavigate && targetPage) {
      // Animate out
      controls.start({
        x: offset.x > 0 ? 1000 : -1000,
        opacity: 0,
        transition: { duration: 0.2 }
      }).then(() => {
        router.push(targetPage);
        // Reset position
        controls.set({ x: 0, opacity: 1 });
        setSwipeProgress(0);
      });
    } else {
      // Snap back
      controls.start({
        x: 0,
        opacity: 1,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
      });
      setSwipeProgress(0);
    }
  };

  const handleDrag = (_event: any, info: PanInfo) => {
    const maxDrag = 300;
    const progress = Math.abs(info.offset.x) / maxDrag;
    setSwipeProgress(Math.min(progress, 1));
  };

  if (!isSwipeEnabled) {
    return <>{children}</>;
  }

  const pageOrder = getPageOrder();
  const currentIndex = pageOrder.indexOf(pathname);
  const canSwipeLeft = currentIndex < pageOrder.length - 1;
  const canSwipeRight = currentIndex > 0;

  return (
    <div className="relative h-full overflow-hidden">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="h-full touch-pan-y"
      >
        {children}
      </motion.div>

      {/* Swipe indicators */}
      {swipeProgress > 0 && (
        <>
          {canSwipeRight && (
            <motion.div
              className="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: swipeProgress,
                scale: 0.5 + swipeProgress * 0.5,
                x: swipeProgress * 20
              }}
            >
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-3xl">←</span>
              </div>
            </motion.div>
          )}

          {canSwipeLeft && (
            <motion.div
              className="fixed right-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: swipeProgress,
                scale: 0.5 + swipeProgress * 0.5,
                x: -swipeProgress * 20
              }}
            >
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-2xl">
                <span className="text-3xl">→</span>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Page indicator dots */}
      <motion.div
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: swipeProgress > 0.1 ? 0.8 : 0 }}
      >
        <div className="flex gap-2 bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-full">
          {pageOrder.map((page, index) => (
            <div
              key={page}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-purple-500 w-6'
                  : 'bg-gray-400'
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
