import { Metadata } from 'next';
import HomeClient from './home-client';

const appUrl = 'https://fcempowertours-production-6551.up.railway.app';

// Frame configuration for Farcaster embed
export const metadata: Metadata = {
  title: 'EmpowerTours - Travel Stamp Buy Experiences',
  description: 'Mint and share Travel and Music NFTs on EmpowerTours, powered by Monad and Farcaster.',
  openGraph: {
    title: 'EmpowerTours - DigitalPassport',
    description: 'Mint and share Travel and Music NFTs on EmpowerTours.',
    url: appUrl,
    siteName: 'EmpowerTours',
    images: [
      {
        url: `${appUrl}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'EmpowerTours',
      }
    ],
    type: 'website',
  },
  other: {
    'fc:frame': 'next',
    'fc:frame:image': `${appUrl}/images/feed.png`,
    'fc:frame:button:1': 'Open EmpowerTours',
    'fc:frame:button:1:action': 'launch_frame',
    'fc:frame:launch:name': 'EmpowerTours',
    'fc:frame:launch:url': appUrl,
    'fc:frame:launch:splash:image': `${appUrl}/images/splash.png`,
    'fc:frame:launch:splash:background-color': '#353B48',
  },
};

// Frame configuration for the embed
const frame = {
  version: "next",
  imageUrl: `${appUrl}/images/feed.png`,
  button: {
    title: "Open EmpowerTours",
    action: {
      type: "launch_frame",
      name: "EmpowerTours",
      url: appUrl,
      splashImageUrl: `${appUrl}/images/splash.png`,
      splashBackgroundColor: "#353B48",
    },
  },
};

export default function HomePage() {
  return <HomeClient />;
}
