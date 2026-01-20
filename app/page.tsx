import { Metadata } from 'next';
import OraclePage from './oracle/page';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function generateMetadata(): Promise<Metadata> {
  // Mini App embed configuration
  const frame = {
    version: "1", // CRITICAL: Must be "1", not "next" or "vNext"
    imageUrl: `${APP_URL}/images/feed.png`, // 3:2 aspect ratio
    button: {
      title: "Open EmpowerTours", // Max 32 characters
      action: {
        type: "launch_frame",
        name: "EmpowerTours",
        url: APP_URL,
        splashImageUrl: `${APP_URL}/images/splash.png`, // 200x200px
        splashBackgroundColor: "#353B48"
      }
    }
  };

  return {
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
    openGraph: {
      title: 'EmpowerTours - DigitalPassport',
      description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
      images: [`${APP_URL}/images/og-image.png`],
    },
    other: {
      "fc:miniapp": JSON.stringify(frame)
    }
  };
}

export default function Page() {
  // DailyAccessGate is already applied at layout level via PassportGate
  return <OraclePage />;
}
