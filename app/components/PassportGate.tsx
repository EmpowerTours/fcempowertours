'use client';

import DailyAccessGate from './DailyAccessGate';

interface PassportGateProps {
  children: React.ReactNode;
}

/**
 * PassportGate - Main access control wrapper
 *
 * Now delegates all access checks to DailyAccessGate which handles:
 * 1. Music subscription
 * 2. Follow @unify34 on Farcaster
 * 3. Passport NFT ownership
 * 4. Daily lottery entry
 */
export default function PassportGate({ children }: PassportGateProps) {
  return (
    <DailyAccessGate>
      {children}
    </DailyAccessGate>
  );
}
