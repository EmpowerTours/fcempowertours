import { Metadata } from 'next';
import { GalaxyWrapper } from '@/app/components/galaxy/GalaxyWrapper';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Monad Galaxy - EmpowerTours',
    description: 'Explore the Monad ecosystem galaxy and earn TOURS tokens!',
    openGraph: {
      title: 'Monad Galaxy - EmpowerTours',
      description: 'Explore the Monad ecosystem galaxy and earn TOURS tokens!',
      images: [`${APP_URL}/images/og-image.png`],
    },
  };
}

export default function GalaxyPage() {
  return <GalaxyWrapper />;
}
