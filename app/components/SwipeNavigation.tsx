'use client';

import { ReactNode } from 'react';

interface SwipeNavigationProps {
  children: ReactNode;
}

export default function SwipeNavigation({ children }: SwipeNavigationProps) {
  // Temporarily disabled - will re-enable after fixing layout issues
  // The swipe navigation was causing layout conflicts
  return <>{children}</>;
}
