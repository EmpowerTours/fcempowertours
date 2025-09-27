import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { config } from '../lib/wagmiConfig'; // Adjust path if lib is not in root
import { Providers } from './providers';

export default function RootLayout({ children }) {
  const initialState = cookieToInitialState(config, headers().get('cookie'));
  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
