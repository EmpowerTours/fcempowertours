import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { EPK_SLUG_PREFIX } from '@/lib/epk/constants';
import { fetchEPKFromIPFS, fetchEPKFromChain } from '@/lib/epk/utils';
import type { EPKMetadata } from '@/lib/epk/types';

const redis = Redis.fromEnv();
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';

/**
 * GET /api/epk/pdf/[identifier] - Generate EPK as downloadable PDF
 * Uses @react-pdf/renderer for server-side PDF generation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;

    // Resolve identifier to artist address
    let artistAddress: string | null = null;
    if (identifier.startsWith('0x') && identifier.length === 42) {
      artistAddress = identifier;
    } else {
      artistAddress = await redis.get<string>(`${EPK_SLUG_PREFIX}${identifier}`);
    }

    if (!artistAddress) {
      return NextResponse.json({ error: 'EPK not found' }, { status: 404 });
    }

    // Fetch EPK data
    let epkMetadata: EPKMetadata | null = null;

    if (ENVIO_ENDPOINT) {
      const onChainData = await fetchEPKFromChain(artistAddress, ENVIO_ENDPOINT);
      if (onChainData) {
        epkMetadata = await fetchEPKFromIPFS(onChainData.ipfsCid);
      }
    }

    if (!epkMetadata) {
      const cachedCid = await redis.get<string>(`epk:cache:${artistAddress}`);
      if (cachedCid) {
        epkMetadata = await fetchEPKFromIPFS(cachedCid);
      }
    }

    if (!epkMetadata) {
      return NextResponse.json({ error: 'EPK metadata not found' }, { status: 404 });
    }

    // Dynamic import @react-pdf/renderer (server-side only)
    const { renderToBuffer, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
    const React = (await import('react')).default;

    const styles = StyleSheet.create({
      page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#0f172a', color: '#e2e8f0' },
      header: { marginBottom: 30 },
      title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
      subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 4 },
      genrePills: { flexDirection: 'row', gap: 8, marginTop: 8 },
      pill: { backgroundColor: '#1e293b', padding: '4 10', borderRadius: 12, fontSize: 10, color: '#a78bfa' },
      section: { marginBottom: 24 },
      sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#a78bfa', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 6 },
      bio: { fontSize: 11, lineHeight: 1.6, color: '#cbd5e1' },
      pressItem: { marginBottom: 12, padding: 12, backgroundColor: '#1e293b', borderRadius: 6 },
      pressOutlet: { fontSize: 10, color: '#a78bfa', fontWeight: 'bold', marginBottom: 2 },
      pressTitle: { fontSize: 12, color: '#ffffff', marginBottom: 4 },
      pressExcerpt: { fontSize: 10, color: '#94a3b8' },
      pressDate: { fontSize: 9, color: '#64748b', marginTop: 4 },
      riderSection: { marginBottom: 10 },
      riderTitle: { fontSize: 12, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 4 },
      riderItem: { fontSize: 10, color: '#94a3b8', marginLeft: 12, marginBottom: 2 },
      bookingSection: { padding: 16, backgroundColor: '#1e293b', borderRadius: 8, marginTop: 12 },
      bookingTitle: { fontSize: 14, fontWeight: 'bold', color: '#a78bfa', marginBottom: 8 },
      bookingItem: { fontSize: 10, color: '#cbd5e1', marginBottom: 3 },
      footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', fontSize: 9, color: '#475569' },
      verifiedBadge: { fontSize: 10, color: '#22c55e', marginTop: 8 },
    });

    const epk = epkMetadata;

    const EPKDocument = React.createElement(Document, {},
      // Page 1: Hero + Bio + Press
      React.createElement(Page, { size: 'A4', style: styles.page },
        React.createElement(View, { style: styles.header },
          React.createElement(Text, { style: styles.title }, epk.artist.name),
          React.createElement(Text, { style: styles.subtitle }, epk.artist.location),
          React.createElement(View, { style: styles.genrePills },
            ...epk.artist.genre.map((g, i) =>
              React.createElement(Text, { key: i, style: styles.pill }, g)
            )
          ),
          epk.onChain?.ipfsCid &&
            React.createElement(Text, { style: styles.verifiedBadge }, `On-chain verified | IPFS: ${epk.onChain.ipfsCid.slice(0, 16)}...`)
        ),
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'About'),
          React.createElement(Text, { style: styles.bio }, epk.artist.bio)
        ),
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Press'),
          ...epk.press.map((article, i) =>
            React.createElement(View, { key: i, style: styles.pressItem },
              React.createElement(Text, { style: styles.pressOutlet }, article.outlet),
              React.createElement(Text, { style: styles.pressTitle }, article.title),
              React.createElement(Text, { style: styles.pressExcerpt }, article.excerpt),
              React.createElement(Text, { style: styles.pressDate }, article.date)
            )
          )
        ),
        React.createElement(Text, { style: styles.footer }, `${epk.artist.name} | Electronic Press Kit | EmpowerTours on Monad`)
      ),
      // Page 2: Technical + Hospitality Riders
      React.createElement(Page, { size: 'A4', style: styles.page },
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Technical Rider'),
          ...Object.values(epk.technicalRider).map((section, i) =>
            React.createElement(View, { key: i, style: styles.riderSection },
              React.createElement(Text, { style: styles.riderTitle }, section.title),
              ...section.items.map((item: string, j: number) =>
                React.createElement(Text, { key: j, style: styles.riderItem }, `• ${item}`)
              )
            )
          )
        ),
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Hospitality Rider'),
          ...Object.values(epk.hospitalityRider).map((section, i) =>
            React.createElement(View, { key: i, style: styles.riderSection },
              React.createElement(Text, { style: styles.riderTitle }, section.title),
              ...section.items.map((item: string, j: number) =>
                React.createElement(Text, { key: j, style: styles.riderItem }, `• ${item}`)
              )
            )
          )
        ),
        React.createElement(Text, { style: styles.footer }, `${epk.artist.name} | Electronic Press Kit | EmpowerTours on Monad`)
      ),
      // Page 3: Booking
      React.createElement(Page, { size: 'A4', style: styles.page },
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Booking Information'),
          React.createElement(View, { style: styles.bookingSection },
            React.createElement(Text, { style: styles.bookingTitle }, 'Pricing'),
            React.createElement(Text, { style: styles.bookingItem }, epk.booking.pricing),
            React.createElement(Text, { style: { ...styles.bookingTitle, marginTop: 12 } }, 'Available For'),
            ...epk.booking.availableFor.map((item, i) =>
              React.createElement(Text, { key: i, style: styles.bookingItem }, `• ${item}`)
            ),
            React.createElement(Text, { style: { ...styles.bookingTitle, marginTop: 12 } }, 'Target Events'),
            ...epk.booking.targetEvents.map((item, i) =>
              React.createElement(Text, { key: i, style: styles.bookingItem }, `• ${item}`)
            ),
            React.createElement(Text, { style: { ...styles.bookingTitle, marginTop: 12 } }, 'Territories'),
            ...epk.booking.territories.map((item, i) =>
              React.createElement(Text, { key: i, style: styles.bookingItem }, `• ${item}`)
            )
          )
        ),
        React.createElement(View, { style: { ...styles.section, marginTop: 20 } },
          React.createElement(Text, { style: styles.sectionTitle }, 'Contact'),
          React.createElement(Text, { style: styles.bookingItem }, `Booking inquiries: Visit empowertours.xyz/epk/${epk.artist.slug}`),
          React.createElement(Text, { style: styles.bookingItem }, 'WMON deposit required for booking confirmation'),
          epk.socials?.farcaster && React.createElement(Text, { style: styles.bookingItem }, `Farcaster: @${epk.socials.farcaster}`)
        ),
        React.createElement(Text, { style: styles.footer }, `${epk.artist.name} | Electronic Press Kit | EmpowerTours on Monad`)
      )
    );

    const pdfBuffer = await renderToBuffer(EPKDocument);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${epk.artist.slug || 'epk'}-press-kit.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[EPK PDF] Error:', error);
    return NextResponse.json({ error: error.message || 'PDF generation failed' }, { status: 500 });
  }
}
