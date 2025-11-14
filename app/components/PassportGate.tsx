'use client';

import { useState, useEffect } from 'react';
import PassportRequirement from './PassportRequirement';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { usePassportNFT } from '@/src/hooks/usePassportNFT';
import { Address } from 'viem';
import { usePathname } from 'next/navigation';

interface PassportGateProps {
  children: React.ReactNode;
}

export default function PassportGate({ children }: PassportGateProps) {
  const { walletAddress, isLoading: contextLoading } = useFarcasterContext();
  const { useBalanceOf } = usePassportNFT();
  const pathname = usePathname();

  const [showGate, setShowGate] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Check if user has any passports
  const { data: passportBalance, isLoading: balanceLoading } = useBalanceOf(walletAddress as Address);
  const hasPassport = passportBalance !== undefined && passportBalance !== null && passportBalance > 0n;

  useEffect(() => {
    // Don't check until we have a wallet address and balance has loaded
    if (contextLoading || balanceLoading || !walletAddress) {
      return;
    }

    // Mark that we've checked
    if (!hasChecked) {
      setHasChecked(true);
    }

    // If user doesn't have a passport, show the gate
    if (!hasPassport) {
      setShowGate(true);
    } else {
      setShowGate(false);
    }
  }, [hasPassport, balanceLoading, contextLoading, walletAddress, hasChecked]);

  const handlePassportMinted = () => {
    console.log('✅ Passport minted! Allowing navigation...');
    setShowGate(false);
  };

  // Show children while loading
  if (!hasChecked || contextLoading) {
    return <>{children}</>;
  }

  return (
    <>
      {showGate && <PassportRequirement onPassportMinted={handlePassportMinted} />}
      {children}
    </>
  );
}
