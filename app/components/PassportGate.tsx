'use client';

interface PassportGateProps {
  children: React.ReactNode;
}

/**
 * PassportGate - Access control wrapper
 *
 * Currently disabled - passes through children directly.
 * TODO: Re-enable access control when lottery contract is deployed on mainnet.
 */
export default function PassportGate({ children }: PassportGateProps) {
  return <>{children}</>;
}
