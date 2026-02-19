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

    // Helper: safe string coercion for IPFS data that may have unexpected types
    const s = (val: any): string => (val == null ? '' : String(val));

    const h = React.createElement;

    // Build header children
    const headerChildren: any[] = [
      h(Text, { key: 'name', style: styles.title }, s(epk.artist.name)),
      h(Text, { key: 'loc', style: styles.subtitle }, s(epk.artist.location)),
      h(View, { key: 'genres', style: styles.genrePills },
        ...(epk.artist.genre || []).map((g: string, i: number) =>
          h(Text, { key: `g${i}`, style: styles.pill }, s(g))
        )
      ),
    ];
    if (epk.onChain?.ipfsCid) {
      headerChildren.push(
        h(Text, { key: 'verified', style: styles.verifiedBadge }, `On-chain verified | IPFS: ${String(epk.onChain.ipfsCid).slice(0, 16)}...`)
      );
    }

    // Build press section children
    const pressChildren: any[] = [
      h(Text, { key: 'pt', style: styles.sectionTitle }, 'Press'),
    ];
    (epk.press || []).forEach((article: any, i: number) => {
      pressChildren.push(
        h(View, { key: `p${i}`, style: styles.pressItem },
          h(Text, { key: `po${i}`, style: styles.pressOutlet }, s(article.outlet)),
          h(Text, { key: `pt${i}`, style: styles.pressTitle }, s(article.title)),
          h(Text, { key: `pe${i}`, style: styles.pressExcerpt }, s(article.excerpt)),
          h(Text, { key: `pd${i}`, style: styles.pressDate }, s(article.date))
        )
      );
    });

    // Build contact children
    const contactChildren: any[] = [
      h(Text, { key: 'ct', style: styles.sectionTitle }, 'Contact'),
      h(Text, { key: 'c1', style: styles.bookingItem }, `Booking inquiries: Visit empowertours.xyz/epk/${s(epk.artist.slug)}`),
      h(Text, { key: 'c2', style: styles.bookingItem }, 'WMON deposit required for booking confirmation'),
    ];
    if (epk.socials?.farcaster) {
      contactChildren.push(
        h(Text, { key: 'c3', style: styles.bookingItem }, `Farcaster: @${s(epk.socials.farcaster)}`)
      );
    }

    // Build technical rider children
    const techRiderChildren: any[] = [
      h(Text, { key: 'tr', style: styles.sectionTitle }, 'Technical Rider'),
    ];
    Object.values(epk.technicalRider || {}).forEach((section: any, i: number) => {
      const items = (section.items || []).map((item: string, j: number) =>
        h(Text, { key: `t${i}${j}`, style: styles.riderItem }, `\u2022 ${s(item)}`)
      );
      techRiderChildren.push(
        h(View, { key: `ts${i}`, style: styles.riderSection },
          h(Text, { key: `tt${i}`, style: styles.riderTitle }, s(section.title)),
          ...items
        )
      );
    });

    // Build hospitality rider children
    const hospRiderChildren: any[] = [
      h(Text, { key: 'hr', style: styles.sectionTitle }, 'Hospitality Rider'),
    ];
    Object.values(epk.hospitalityRider || {}).forEach((section: any, i: number) => {
      const items = (section.items || []).map((item: string, j: number) =>
        h(Text, { key: `h${i}${j}`, style: styles.riderItem }, `\u2022 ${s(item)}`)
      );
      hospRiderChildren.push(
        h(View, { key: `hs${i}`, style: styles.riderSection },
          h(Text, { key: `ht${i}`, style: styles.riderTitle }, s(section.title)),
          ...items
        )
      );
    });

    // Build booking children
    const bookingChildren: any[] = [
      h(Text, { key: 'b1', style: styles.bookingTitle }, 'Pricing'),
      h(Text, { key: 'b2', style: styles.bookingItem }, s(epk.booking?.pricing)),
      h(Text, { key: 'b3', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Available For'),
    ];
    (epk.booking?.availableFor || []).forEach((item: string, i: number) => {
      bookingChildren.push(
        h(Text, { key: `a${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
      );
    });
    bookingChildren.push(
      h(Text, { key: 'b4', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Target Events')
    );
    (epk.booking?.targetEvents || []).forEach((item: string, i: number) => {
      bookingChildren.push(
        h(Text, { key: `e${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
      );
    });
    bookingChildren.push(
      h(Text, { key: 'b5', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Territories')
    );
    (epk.booking?.territories || []).forEach((item: string, i: number) => {
      bookingChildren.push(
        h(Text, { key: `r${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
      );
    });

    const footerText = `${s(epk.artist.name)} | Electronic Press Kit | EmpowerTours on Monad`;

    const EPKDocument = h(Document, {},
      // Page 1: Hero + Bio + Press
      h(Page, { key: 'p1', size: 'A4', style: styles.page },
        h(View, { style: styles.header }, ...headerChildren),
        h(View, { style: styles.section },
          h(Text, { style: styles.sectionTitle }, 'About'),
          h(Text, { style: styles.bio }, s(epk.artist.bio))
        ),
        h(View, { style: styles.section }, ...pressChildren),
        h(Text, { style: styles.footer }, footerText)
      ),
      // Page 2: Technical + Hospitality Riders
      h(Page, { key: 'p2', size: 'A4', style: styles.page },
        h(View, { style: styles.section }, ...techRiderChildren),
        h(View, { style: styles.section }, ...hospRiderChildren),
        h(Text, { style: styles.footer }, footerText)
      ),
      // Page 3: Booking
      h(Page, { key: 'p3', size: 'A4', style: styles.page },
        h(View, { style: styles.section },
          h(Text, { style: styles.sectionTitle }, 'Booking Information'),
          h(View, { style: styles.bookingSection }, ...bookingChildren)
        ),
        h(View, { style: { ...styles.section, marginTop: 20 } }, ...contactChildren),
        h(Text, { style: styles.footer }, footerText)
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
    console.error('[EPK PDF] Error:', error?.message, error?.stack);
    return NextResponse.json({
      error: error?.message || 'PDF generation failed',
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    }, { status: 500 });
  }
}
