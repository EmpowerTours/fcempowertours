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
        const raw = Buffer.from(await res.arrayBuffer());
        console.log(`[EPK PDF] Image fetched (${raw.length} bytes) from ${tryUrl}`);
        // pdfkit only supports JPEG and PNG — convert any format (WebP, etc.) to PNG via sharp
        try {
          const { default: sharp } = await import('sharp');
          const png = await sharp(raw).png().toBuffer();
          console.log(`[EPK PDF] Converted to PNG (${png.length} bytes)`);
          return png;
        } catch (convErr) {
          console.warn(`[EPK PDF] sharp conversion failed, returning raw buffer:`, (convErr as Error).message);
          return raw;
        }
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
      MusicNFT(
        where: { artist: { _eq: $artist }, isBurned: { _eq: false } }
        order_by: { tokenId: desc }
        limit: 1
      ) {
        tokenId
        name
        imageUrl
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
    const nfts: any[] = data?.data?.MusicNFT || [];

    console.log(`[EPK PDF] NFTs from Envio for ${artistAddress}:`, nfts.map((n: any) => ({ id: n.tokenId, name: n.name, imageUrl: n.imageUrl })));

    // Fetch cover images in parallel (failures return null)
    return await Promise.all(
      nfts.map(async (nft) => {
        const resolvedUrl = resolveIpfsUrl(nft.imageUrl || '');
        console.log(`[EPK PDF] Fetching cover for token #${nft.tokenId}: raw="${nft.imageUrl}" resolved="${resolvedUrl}"`);
        return {
          tokenId: nft.tokenId,
          title: nft.name || `Track #${nft.tokenId}`,
          coverImage: nft.imageUrl || '',
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
      bufferPages: true, // allow switchToPage() so we can pin footer/NFT to page 1
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

    // Pre-compute layout geometry so we can clamp text heights (prevents page overflow)
    const FOOTER_H_CONST  = 34;
    const hasNFTs_const   = nfts.length > 0;
    const DISC_H_CONST    = hasNFTs_const ? 105 : 0;
    const discY_const     = PAGE_H - FOOTER_H_CONST - DISC_H_CONST - 6; // ~697 with NFTs
    const COL_TOP         = 108;
    const MAX_TEXT_Y      = discY_const - 12; // stop text here to avoid running into disc strip
    const PRESS_RESERVE   = 130; // approx pts needed for 3 press articles
    const BIO_MAX_H       = Math.max(60, MAX_TEXT_Y - COL_TOP - PRESS_RESERVE);

    // Fill dark background on every page (including any auto-added overflow pages)
    const fillPageBG = () => doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    doc.on('pageAdded', fillPageBG);

    // ── Full-page dark background (page 1) ────────────────────────────────────
    fillPageBG();

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

    // Left column: Bio + Press (bio clamped to BIO_MAX_H to prevent page overflow)
    doc.fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('ABOUT', colL, COL_TOP);
    doc.moveDown(0.15);
    doc.fillColor(LIGHT).fontSize(8.5).font('Helvetica')
      .text(s(epk.artist.bio), colL, doc.y, { width: colW, lineGap: 1.5, height: BIO_MAX_H, ellipsis: true });

    const pressArticles = (epk.press || []).slice(0, 3);
    if (pressArticles.length && doc.y < MAX_TEXT_Y - 60) {
      doc.moveDown(0.5).fillColor(PURPLE).fontSize(10).font('Helvetica-Bold').text('PRESS', colL, doc.y);
      doc.moveDown(0.15);
      for (const a of pressArticles) {
        if (doc.y >= MAX_TEXT_Y - 30) break; // stop if near bottom
        doc.fillColor(PURPLE).fontSize(8).font('Helvetica-Bold').text(s(a.outlet), colL, doc.y, { width: colW });
        doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold').text(s(a.title), colL, doc.y, { width: colW });
        if (a.excerpt && doc.y < MAX_TEXT_Y - 20) doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(s(a.excerpt), colL, doc.y, { width: colW, lineGap: 1, height: 30, ellipsis: true });
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

    // ── Switch back to page 1 so NFT strip and footer always land on page 1 ───
    doc.switchToPage(0);

    // ── Discography strip (NFT cover art) ─────────────────────────────────────
    const hasNFTs   = hasNFTs_const;
    const FOOTER_H  = FOOTER_H_CONST;
    const discY     = discY_const;

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
          doc.image(nft.imageBuffer, thumbX, thumbStartY, { fit: [THUMB, THUMB] });
        } catch (imgErr) {
          console.warn('[EPK PDF] doc.image() failed:', (imgErr as Error).message);
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

    doc.flushPages(); // required when bufferPages: true
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
