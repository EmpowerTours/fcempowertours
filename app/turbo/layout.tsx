import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TURBO by EmpowerTours',
  description: 'Train. Build. Fund. The launchpad to NITRO — a 12-month program by EmpowerTours preparing Web3 founders on Monad.',
};

export default function TurboLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
