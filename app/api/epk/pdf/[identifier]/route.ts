import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { EPK_SLUG_PREFIX } from '@/lib/epk/constants';
import { fetchEPKFromIPFS, fetchEPKFromChain } from '@/lib/epk/utils';
import type { EPKMetadata } from '@/lib/epk/types';

const redis = Redis.fromEnv();
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

// Safe string coercion for IPFS data
const s = (val: unknown): string => (val == null ? '' : String(val));

interface NFTTrack {
  tokenId: number;
  title: string;
  coverImage: string;
  imageBuffer: Buffer | null;
}

function resolveIpfsUrl(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) return `https://${PINATA_GATEWAY}/ipfs/${uri.slice(7)}`;
  if (/^(Qm|bafy|bafk)/i.test(uri)) return `https://${PINATA_GATEWAY}/ipfs/${uri}`;
  return uri;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  // Build a list of URLs to try (primary + fallback gateways for IPFS)
  const urls: string[] = [url];
  const ipfsCidMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (ipfsCidMatch) {
    urls.push(`https://ipfs.io/ipfs/${ipfsCidMatch[1]}`);
    urls.push(`https://gateway.pinata.cloud/ipfs/${ipfsCidMatch[1]}`);
  }
  for (const tryUrl of urls) {
    try {
      const res = await fetch(tryUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`[EPK PDF] Image fetched (${buf.length} bytes) from ${tryUrl}`);
        return buf;
      }
    } catch {
      // try next
    }
  }
  console.warn(`[EPK PDF] Image fetch failed for all gateways: ${url}`);
  return null;
}

async function fetchArtistNFTs(
  artistAddress: string,
  envioEndpoint: string
): Promise<NFTTrack[]> {
  if (!envioEndpoint) return [];

  const query = `
    query ArtistNFTs($artist: String!) {
      EmpowerToursNFT_MasterMinted(
        where: { artist: { _eq: $artist } }
        order_by: { tokenId: desc }
        limit: 1
      ) {
        tokenId
        title
        coverImage
      }
    }
  `;

  try {
    const res = await fetch(envioEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { artist: artistAddress.toLowerCase() } }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const nfts: any[] = data?.data?.EmpowerToursNFT_MasterMinted || [];

    console.log(`[EPK PDF] NFTs from Envio for ${artistAddress}:`, nfts.map((n: any) => ({ id: n.tokenId, title: n.title, coverImage: n.coverImage })));

    // Fetch cover images in parallel (failures return null)
    return await Promise.all(
      nfts.map(async (nft) => {
        const resolvedUrl = resolveIpfsUrl(nft.coverImage || '');
        console.log(`[EPK PDF] Fetching cover for token #${nft.tokenId}: raw="${nft.coverImage}" resolved="${resolvedUrl}"`);
        return {
          tokenId: nft.tokenId,
          title: nft.title || `Track #${nft.tokenId}`,
          coverImage: nft.coverImage || '',
          imageBuffer: await fetchImageBuffer(resolvedUrl),
        };
      })
    );
  } catch (err) {
    console.warn('[EPK PDF] NFT fetch failed:', (err as Error).message);
    return [];
  }
}

async function generatePDFBuffer(epk: EPKMetadata, nfts: NFTTrack[]): Promise<Buffer> {
  // Use @react-pdf/pdfkit directly — no React dependency, no dual-instance issue
  const { default: PDFDocument } = await import('@react-pdf/pdfkit' as any);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      autoFirstPage: true,
      info: {
        Title: `${s(epk.artist.name)} — Electronic Press Kit`,
        Author: 'EmpowerTours',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BG     = '#0f0a2a'; // deep navy background
    const PURPLE = '#a78bfa';
    const WHITE  = '#ffffff';
    const MUTED  = '#94a3b8';
    const LIGHT  = '#cbd5e1';
    const GREEN  = '#22c55e';
    const DARK   = '#1e1b4b';
    const W      = doc.page.width - 80;
    const PAGE_H = doc.page.height;

    // ── Full-page dark background ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, PAGE_H).fill(BG);

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fillColor(WHITE).fontSize(24).font('Helvetica-Bold').text(s(epk.artist.name), 40, 40);

    const genres = (epk.artist.genre || []).map(s).join('  ·  ');
    const locationLine = [s(epk.artist.location), genres].filter(Boolean).join('   |   ');
    if (locationLine) {
      doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(locationLine, 40, 70);
    }

    if (epk.onChain?.ipfsCid) {
      doc.fillColor(GREEN).fontSize(8)
        .text(`✓ On-chain verified · ${String(epk.onChain.ipfsCid).slice(0, 24)}...`, 40, 86);
    }

    doc.moveTo(40, 100).lineTo(doc.page.width - 40, 100).strokeColor(PURPLE).lineWidth(1).stroke();

    // ── Two-column layout ─────────────────────────────────────────────────────
    const colL = 40;
    const colR = doc.page.width / 2 + 10;
    const colW = doc.page.width / 2 - 55;
    const COL_TOP = 108;

    // Left column: Bio + Press
    doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('ABOUT', colL, COL_TOP);
    doc.moveDown(0.15);
    doc.fillColor(LIGHT).fontSize(8.5).font('Helvetica')
      .text(s(epk.artist.bio), colL, doc.y, { width: colW, lineGap: 1.5 });

    const pressArticles = (epk.press || []).slice(0, 3);
    if (pressArticles.length) {
      doc.moveDown(0.5).fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('PRESS', colL, doc.y);
      doc.moveDown(0.15);
      for (const a of pressArticles) {
        doc.fillColor(PURPLE).fontSize(8).font('Helvetica-Bold').text(s(a.outlet), colL, doc.y, { width: colW });
        doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold').text(s(a.title), colL, doc.y, { width: colW });
        if (a.excerpt) doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(s(a.excerpt), colL, doc.y, { width: colW, lineGap: 1 });
        doc.moveDown(0.3);
      }
    }

    // Right column: Booking + Riders + Contact
    let rY = COL_TOP;

    if (epk.booking?.pricing || (epk.booking?.availableFor || []).length) {
      doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('BOOKING', colR, rY, { width: colW });
      rY = doc.y + 2;
      if (epk.booking?.pricing) {
        doc.fillColor(LIGHT).fontSize(8.5).font('Helvetica').text(s(epk.booking.pricing), colR, rY, { width: colW });
        rY = doc.y + 2;
      }
      for (const item of (epk.booking?.availableFor || []).slice(0, 4)) {
        doc.fillColor(LIGHT).fontSize(8).font('Helvetica').text(`• ${s(item)}`, colR, rY, { width: colW });
        rY = doc.y;
      }
      rY += 6;
    }

    const techSecs = Object.values(epk.technicalRider || {}) as any[];
    if (techSecs.length) {
      doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('TECHNICAL RIDER', colR, rY, { width: colW });
      rY = doc.y + 2;
      for (const sec of techSecs.slice(0, 3)) {
        doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold').text(s(sec.title), colR, rY, { width: colW });
        rY = doc.y;
        for (const item of (sec.items || []).slice(0, 3)) {
          doc.fillColor(LIGHT).fontSize(8).font('Helvetica').text(`• ${s(item)}`, colR, rY, { width: colW });
          rY = doc.y;
        }
      }
      rY += 6;
    }

    const contactParts = [`empowertours.xyz/epk/${s(epk.artist.slug)}`];
    if (epk.socials?.farcaster) contactParts.push(`Farcaster: @${s(epk.socials.farcaster)}`);
    if (epk.socials?.twitter)   contactParts.push(`X: @${s(epk.socials.twitter)}`);
    if (epk.socials?.website)   contactParts.push(s(epk.socials.website));
    doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('CONTACT', colR, rY, { width: colW });
    rY = doc.y + 2;
    for (const line of contactParts) {
      doc.fillColor(LIGHT).fontSize(8.5).font('Helvetica').text(line, colR, rY, { width: colW });
      rY = doc.y;
    }

    // ── Discography strip (NFT cover art) ─────────────────────────────────────
    const hasNFTs = nfts.length > 0;
    const DISC_SECTION_H = hasNFTs ? 105 : 0; // reserve space above footer
    const FOOTER_H = 34;
    const discY = PAGE_H - FOOTER_H - DISC_SECTION_H - 6;

    if (hasNFTs) {
      // Section divider
      doc.moveTo(40, discY).lineTo(doc.page.width - 40, discY)
        .strokeColor(PURPLE).lineWidth(0.4).stroke();

      doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold')
        .text('LATEST RELEASE', 40, discY + 5, { characterSpacing: 0.5 });

      // Single latest NFT — larger thumbnail on the left, title/label on the right
      const nft = nfts[0];
      const THUMB = 72;
      const thumbX = 40;
      const thumbStartY = discY + 16;

      if (nft.imageBuffer) {
        try {
          doc.image(nft.imageBuffer, thumbX, thumbStartY, {
            width: THUMB,
            height: THUMB,
            fit: [THUMB, THUMB],
          });
        } catch {
          doc.rect(thumbX, thumbStartY, THUMB, THUMB).fillAndStroke(DARK, PURPLE);
          doc.fillColor(MUTED).fontSize(20).font('Helvetica')
            .text('♪', thumbX, thumbStartY + THUMB / 2 - 10, { width: THUMB, align: 'center' });
        }
      } else {
        doc.rect(thumbX, thumbStartY, THUMB, THUMB).fillAndStroke(DARK, PURPLE);
        doc.fillColor(MUTED).fontSize(20).font('Helvetica')
          .text('♪', thumbX, thumbStartY + THUMB / 2 - 10, { width: THUMB, align: 'center' });
      }

      const infoX = thumbX + THUMB + 12;
      const infoW = W - THUMB - 12;
      doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
        .text(s(nft.title), infoX, thumbStartY + 4, { width: infoW });
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
        .text(`Latest release · Token #${nft.tokenId} · EmpowerTours on Monad`, infoX, doc.y + 2, { width: infoW });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerLineY = PAGE_H - FOOTER_H;
    doc.moveTo(40, footerLineY).lineTo(doc.page.width - 40, footerLineY)
      .strokeColor(PURPLE).lineWidth(0.3).stroke();
    doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
      .text(
        `${s(epk.artist.name)} · Electronic Press Kit · EmpowerTours on Monad`,
        40, footerLineY + 6,
        { align: 'center', width: W }
      );

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

    // Fetch NFTs in parallel with PDF generation prep
    const nfts = await fetchArtistNFTs(artistAddress, ENVIO_ENDPOINT);

    const pdfBuffer = await generatePDFBuffer(epkMetadata, nfts);

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
