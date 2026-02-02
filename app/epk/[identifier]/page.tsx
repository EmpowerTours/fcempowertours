import { Metadata } from 'next';
import EPKPage from './EPKPage';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

interface Props {
  params: Promise<{ identifier: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params;

  // Fetch EPK data for metadata
  try {
    const res = await fetch(`${APP_URL}/api/epk/${identifier}`, {
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data = await res.json();
      const epk = data.epk;

      if (epk) {
        const title = `${epk.artist.name} | Electronic Press Kit`;
        const description = `${epk.artist.genre.join(', ')} | ${epk.artist.location}`;
        const ogImage = `${APP_URL}/api/og/epk?name=${encodeURIComponent(epk.artist.name)}&genre=${encodeURIComponent(epk.artist.genre.join(','))}&location=${encodeURIComponent(epk.artist.location)}&verified=${!!epk.onChain?.ipfsCid}`;

        return {
          title,
          description: epk.artist.bio.slice(0, 160),
          openGraph: {
            title,
            description,
            images: [{ url: ogImage, width: 1200, height: 630 }],
            type: 'profile',
          },
          twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [ogImage],
          },
          other: {
            'fc:frame': 'vNext',
            'fc:frame:image': ogImage,
            'fc:frame:image:aspect_ratio': '1.91:1',
            'fc:frame:button:1': 'View Press Kit',
            'fc:frame:button:1:action': 'link',
            'fc:frame:button:1:target': `${APP_URL}/epk/${identifier}`,
          },
        };
      }
    }
  } catch {
    // Fall through to default
  }

  return {
    title: 'Electronic Press Kit | EmpowerTours',
    description: 'Artist Electronic Press Kit on EmpowerTours',
  };
}

export default async function EPKPageRoute({ params }: Props) {
  const { identifier } = await params;

  return <EPKPage identifier={identifier} />;
}
