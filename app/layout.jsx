import './globals.css';
import { Inter } from 'next/font/google';
import BottomNav from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'EmpowerTours',
  description: 'AI-powered travel app on Farcaster with NFT minting and group funding.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gradient-to-b from-green-100 to-blue-100`}>
        <main className="pb-16">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
