import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "EmpowerTours",
  description: "Farcaster Mini App for Hackathon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
