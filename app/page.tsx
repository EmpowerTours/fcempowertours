import { Metadata } from 'next';
import HomeClient from './home-client';

const appUrl = 'https://fcempowertours-production-6551.up.railway.app';

// Proper Mini App embed configuration
const frame = {
  version: "1",  // Must be "1", not "vNext" 
  imageUrl: `${appUrl}/images/feed.png`,
  button: {
    title: "Open EmpowerTours",
    action: {
      type: "launch_frame",
      name: "EmpowerTours",
      url: appUrl,
      splashImageUrl: `${appUrl}/images/splash.png`,
      splashBackgroundColor: "#353B48"
    }
  }
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'EmpowerTours - Travel Stamp Buy Experiences',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
    openGraph: {
      title: 'EmpowerTours - DigitalPassport',
      description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
      url: appUrl,
      siteName: 'EmpowerTours',
      images: [{
        url: `${appUrl}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'EmpowerTours',
      }],
      type: 'website',
    },
    other: {
      // This is the correct format - single fc:frame tag with JSON string
      "fc:frame": JSON.stringify(frame)
    }
  };
}

export default function HomePage() {
  return <HomeClient />;
}
