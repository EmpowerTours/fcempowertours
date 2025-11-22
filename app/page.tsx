import { Metadata } from 'next';
import { GalaxyWrapper } from '@/app/components/galaxy/GalaxyWrapper';

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
    title: 'Monad Galaxy - EmpowerTours',
    description: 'Explore the Monad ecosystem galaxy and earn TOURS tokens by completing engagement tasks!',
    openGraph: {
      title: 'Monad Galaxy - EmpowerTours',
      description: 'Explore the Monad ecosystem galaxy and earn TOURS tokens!',
      images: [`${APP_URL}/images/og-image.png`],
    },
    other: {
      "fc:miniapp": JSON.stringify(frame)
    }
  };
}

export default function Page() {
  // Show the Monad Galaxy as the landing page after splash screen
  return <GalaxyWrapper />;
}
