import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { EPK_SLUG_PREFIX } from '@/lib/epk/constants';
import { fetchEPKFromIPFS, fetchEPKFromChain } from '@/lib/epk/utils';
import type { EPKMetadata } from '@/lib/epk/types';
// Static imports — both externalized via serverExternalPackages, so they share
// the same Node.js module instance as each other (no dual-React problem)
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

const redis = Redis.fromEnv();
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';

// Helper: safe string coercion for IPFS data that may have unexpected types
const s = (val: unknown): string => (val == null ? '' : String(val));

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

function buildEPKDocument(epk: EPKMetadata) {
  const h = React.createElement;
  const footerText = `${s(epk.artist.name)} | Electronic Press Kit | EmpowerTours on Monad`;

  // Header
  const headerChildren: React.ReactElement[] = [
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
      h(Text, { key: 'verified', style: styles.verifiedBadge },
        `On-chain verified | IPFS: ${String(epk.onChain.ipfsCid).slice(0, 16)}...`
      )
    );
  }

  // Press
  const pressItems = (epk.press || []).map((article: any, i: number) =>
    h(View, { key: `p${i}`, style: styles.pressItem },
      h(Text, { key: `po`, style: styles.pressOutlet }, s(article.outlet)),
      h(Text, { key: `pt`, style: styles.pressTitle }, s(article.title)),
      h(Text, { key: `pe`, style: styles.pressExcerpt }, s(article.excerpt)),
      h(Text, { key: `pd`, style: styles.pressDate }, s(article.date))
    )
  );

  // Technical rider
  const techSections = Object.values(epk.technicalRider || {}).map((section: any, i: number) =>
    h(View, { key: `ts${i}`, style: styles.riderSection },
      h(Text, { key: `tt`, style: styles.riderTitle }, s(section.title)),
      ...(section.items || []).map((item: string, j: number) =>
        h(Text, { key: `ti${j}`, style: styles.riderItem }, `\u2022 ${s(item)}`)
      )
    )
  );

  // Hospitality rider
  const hospSections = Object.values(epk.hospitalityRider || {}).map((section: any, i: number) =>
    h(View, { key: `hs${i}`, style: styles.riderSection },
      h(Text, { key: `ht`, style: styles.riderTitle }, s(section.title)),
      ...(section.items || []).map((item: string, j: number) =>
        h(Text, { key: `hi${j}`, style: styles.riderItem }, `\u2022 ${s(item)}`)
      )
    )
  );

  // Booking
  const bookingLines: React.ReactElement[] = [
    h(Text, { key: 'bprice-title', style: styles.bookingTitle }, 'Pricing'),
    h(Text, { key: 'bprice-val', style: styles.bookingItem }, s(epk.booking?.pricing)),
    h(Text, { key: 'bavail-title', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Available For'),
    ...(epk.booking?.availableFor || []).map((item: string, i: number) =>
      h(Text, { key: `ba${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
    ),
    h(Text, { key: 'btarget-title', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Target Events'),
    ...(epk.booking?.targetEvents || []).map((item: string, i: number) =>
      h(Text, { key: `be${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
    ),
    h(Text, { key: 'bterr-title', style: { ...styles.bookingTitle, marginTop: 12 } }, 'Territories'),
    ...(epk.booking?.territories || []).map((item: string, i: number) =>
      h(Text, { key: `br${i}`, style: styles.bookingItem }, `\u2022 ${s(item)}`)
    ),
  ];

  // Contact
  const contactLines: React.ReactElement[] = [
    h(Text, { key: 'ct', style: styles.sectionTitle }, 'Contact'),
    h(Text, { key: 'c1', style: styles.bookingItem },
      `Booking inquiries: Visit empowertours.xyz/epk/${s(epk.artist.slug)}`
    ),
    h(Text, { key: 'c2', style: styles.bookingItem }, 'WMON deposit required for booking confirmation'),
  ];
  if (epk.socials?.farcaster) {
    contactLines.push(
      h(Text, { key: 'c3', style: styles.bookingItem }, `Farcaster: @${s(epk.socials.farcaster)}`)
    );
  }

  return h(Document, {},
    // Page 1: Hero + Bio + Press
    h(Page, { key: 'p1', size: 'A4', style: styles.page },
      h(View, { style: styles.header }, ...headerChildren),
      h(View, { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'About'),
        h(Text, { style: styles.bio }, s(epk.artist.bio))
      ),
      h(View, { style: styles.section },
        h(Text, { key: 'press-title', style: styles.sectionTitle }, 'Press'),
        ...pressItems
      ),
      h(Text, { style: styles.footer }, footerText)
    ),
    // Page 2: Technical + Hospitality Riders
    h(Page, { key: 'p2', size: 'A4', style: styles.page },
      h(View, { style: styles.section },
        h(Text, { key: 'tr', style: styles.sectionTitle }, 'Technical Rider'),
        ...techSections
      ),
      h(View, { style: styles.section },
        h(Text, { key: 'hr', style: styles.sectionTitle }, 'Hospitality Rider'),
        ...hospSections
      ),
      h(Text, { style: styles.footer }, footerText)
    ),
    // Page 3: Booking + Contact
    h(Page, { key: 'p3', size: 'A4', style: styles.page },
      h(View, { style: styles.section },
        h(Text, { style: styles.sectionTitle }, 'Booking Information'),
        h(View, { style: styles.bookingSection }, ...bookingLines)
      ),
      h(View, { style: { ...styles.section, marginTop: 20 } }, ...contactLines),
      h(Text, { style: styles.footer }, footerText)
    )
  );
}

/**
 * GET /api/epk/pdf/[identifier] - Generate EPK as downloadable PDF
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

    const doc = buildEPKDocument(epkMetadata);
    const pdfBuffer = await renderToBuffer(doc);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${epkMetadata.artist.slug || 'epk'}-press-kit.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[EPK PDF] Error:', error?.message, error?.stack);
    return NextResponse.json({
      error: error?.message || 'PDF generation failed',
    }, { status: 500 });
  }
}
