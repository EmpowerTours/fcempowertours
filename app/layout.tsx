import { ReactNode } from 'react';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { getConfig } from './music/config'; // Adjust path if needed
import { WalletProvider } from '../components/wallet-provider'; // Adjust path if needed
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  // ... other metadata
};
export default async function RootLayout({ children }: { children: ReactNode }) {
  let initialState;
  try {
    const config = getConfig();
    const headerList = await headers(); // Await here
    const cookie = headerList.get('cookie');
    initialState = cookieToInitialState(config, cookie);
  } catch {
    // Fallback for static prerender (no headers available) - Removed unused 'error'
    initialState = undefined;
  }
  return (
    <html lang="en">
      <body>
        <WalletProvider initialState={initialState}>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
