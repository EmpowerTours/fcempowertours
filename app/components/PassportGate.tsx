"use client";

interface PassportGateProps {
  children: React.ReactNode;
}

/**
 * PassportGate - Access control wrapper
 *
 * Currently disabled - passes through children directly.
 */
export default function PassportGate({ children }: PassportGateProps) {
  return <>{children}</>;
}
