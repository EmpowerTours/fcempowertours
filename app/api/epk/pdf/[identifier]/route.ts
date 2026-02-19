import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { EPK_SLUG_PREFIX } from '@/lib/epk/constants';
import { fetchEPKFromIPFS, fetchEPKFromChain } from '@/lib/epk/utils';
import type { EPKMetadata } from '@/lib/epk/types';

const redis = Redis.fromEnv();
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';

// Safe string coercion for IPFS data
const s = (val: unknown): string => (val == null ? '' : String(val));

async function generatePDFBuffer(epk: EPKMetadata): Promise<Buffer> {
  // Use @react-pdf/pdfkit directly — no React dependency, no dual-instance issue
  const { default: PDFDocument } = await import('@react-pdf/pdfkit' as any);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: `${s(epk.artist.name)} — Electronic Press Kit`,
        Author: 'EmpowerTours',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const BG       = '#0f172a';
    const PURPLE   = '#a78bfa';
    const WHITE    = '#ffffff';
    const MUTED    = '#94a3b8';
    const LIGHT    = '#cbd5e1';
    const GREEN    = '#22c55e';
    const W        = doc.page.width - 100; // usable width

    const section = (title: string) => {
      doc.moveDown(0.5)
        .fillColor(PURPLE).fontSize(14).font('Helvetica-Bold').text(title)
        .moveDown(0.2)
        .fillColor(MUTED).fontSize(9).text('─'.repeat(80))
        .moveDown(0.4);
    };

    const body = (text: string, color = LIGHT) => {
      doc.fillColor(color).fontSize(10).font('Helvetica').text(s(text), { width: W, lineGap: 2 });
    };

    const bullet = (text: string) => {
      doc.fillColor(LIGHT).fontSize(10).font('Helvetica').text(`• ${s(text)}`, { indent: 12, width: W - 12 });
    };

    // ── Page 1: Hero + Bio + Press ────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    doc.fillColor(WHITE).fontSize(28).font('Helvetica-Bold')
      .text(s(epk.artist.name), 50, 50);

    doc.fillColor(MUTED).fontSize(13).font('Helvetica')
      .text(s(epk.artist.location), 50, 90);

    const genres: string[] = (epk.artist.genre || []).map(s);
    if (genres.length) {
      doc.fillColor(PURPLE).fontSize(10).text(genres.join('  ·  '), 50, 112);
    }

    if (epk.onChain?.ipfsCid) {
      doc.fillColor(GREEN).fontSize(9)
        .text(`✓ On-chain verified · IPFS: ${String(epk.onChain.ipfsCid).slice(0, 20)}...`, 50, 130);
    }

    doc.moveTo(50, 150).lineTo(doc.page.width - 50, 150).strokeColor(PURPLE).stroke();
    doc.y = 160;

    section('About');
    body(s(epk.artist.bio));

    if ((epk.press || []).length > 0) {
      section('Press');
      for (const article of (epk.press || [])) {
        doc.fillColor(PURPLE).fontSize(9).font('Helvetica-Bold').text(s(article.outlet), { width: W });
        doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text(s(article.title), { width: W });
        doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(s(article.excerpt), { width: W });
        doc.fillColor('#475569').fontSize(8).text(s(article.date), { width: W });
        doc.moveDown(0.5);
      }
    }

    doc.fillColor('#475569').fontSize(8).font('Helvetica')
      .text(`${s(epk.artist.name)} | Electronic Press Kit | EmpowerTours on Monad`,
        50, doc.page.height - 40, { align: 'center', width: W });

    // ── Page 2: Riders ────────────────────────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    doc.y = 50;

    const techSections = Object.values(epk.technicalRider || {}) as any[];
    if (techSections.length) {
      section('Technical Rider');
      for (const sec of techSections) {
        doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text(s(sec.title), { width: W });
        doc.moveDown(0.2);
        for (const item of (sec.items || [])) bullet(item);
        doc.moveDown(0.4);
      }
    }

    const hospSections = Object.values(epk.hospitalityRider || {}) as any[];
    if (hospSections.length) {
      section('Hospitality Rider');
      for (const sec of hospSections) {
        doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text(s(sec.title), { width: W });
        doc.moveDown(0.2);
        for (const item of (sec.items || [])) bullet(item);
        doc.moveDown(0.4);
      }
    }

    doc.fillColor('#475569').fontSize(8).font('Helvetica')
      .text(`${s(epk.artist.name)} | Electronic Press Kit | EmpowerTours on Monad`,
        50, doc.page.height - 40, { align: 'center', width: W });

    // ── Page 3: Booking + Contact ─────────────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    doc.y = 50;

    section('Booking Information');

    if (epk.booking?.pricing) {
      doc.fillColor(PURPLE).fontSize(11).font('Helvetica-Bold').text('Pricing', { width: W });
      body(s(epk.booking.pricing));
      doc.moveDown(0.3);
    }

    if ((epk.booking?.availableFor || []).length) {
      doc.fillColor(PURPLE).fontSize(11).font('Helvetica-Bold').text('Available For', { width: W }).moveDown(0.2);
      for (const item of (epk.booking?.availableFor || [])) bullet(item);
      doc.moveDown(0.3);
    }

    if ((epk.booking?.targetEvents || []).length) {
      doc.fillColor(PURPLE).fontSize(11).font('Helvetica-Bold').text('Target Events', { width: W }).moveDown(0.2);
      for (const item of (epk.booking?.targetEvents || [])) bullet(item);
      doc.moveDown(0.3);
    }

    if ((epk.booking?.territories || []).length) {
      doc.fillColor(PURPLE).fontSize(11).font('Helvetica-Bold').text('Territories', { width: W }).moveDown(0.2);
      for (const item of (epk.booking?.territories || [])) bullet(item);
      doc.moveDown(0.3);
    }

    section('Contact');
    body(`Booking inquiries: empowertours.xyz/epk/${s(epk.artist.slug)}`);
    body('WMON deposit required for booking confirmation');
    if (epk.socials?.farcaster) {
      body(`Farcaster: @${s(epk.socials.farcaster)}`);
    }

    doc.fillColor('#475569').fontSize(8).font('Helvetica')
      .text(`${s(epk.artist.name)} | Electronic Press Kit | EmpowerTours on Monad`,
        50, doc.page.height - 40, { align: 'center', width: W });

    doc.end();
  });
}

/**
 * GET /api/epk/pdf/[identifier] - Generate EPK as downloadable PDF
 * Uses @react-pdf/pdfkit directly (no React) to avoid dual-React instance issues.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;

    let artistAddress: string | null = null;
    if (identifier.startsWith('0x') && identifier.length === 42) {
      artistAddress = identifier;
    } else {
      artistAddress = await redis.get<string>(`${EPK_SLUG_PREFIX}${identifier}`);
    }

    if (!artistAddress) {
      return NextResponse.json({ error: 'EPK not found' }, { status: 404 });
    }

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

    const pdfBuffer = await generatePDFBuffer(epkMetadata);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${epkMetadata.artist.slug || 'epk'}-press-kit.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[EPK PDF] Error:', error?.message, error?.stack);
    return NextResponse.json({ error: error?.message || 'PDF generation failed' }, { status: 500 });
  }
}
