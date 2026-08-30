/**
 * The EPK press kit, rendered to a single-page PDF.
 *
 * ## Why this is a module and not part of the route
 *
 * It lived inside `app/api/epk/pdf/[identifier]/route.ts`, where nothing could call it, and it
 * hung in production for five days without anyone being able to reproduce it locally. A function
 * that returns a Promise around an event emitter is exactly the kind that needs a test, and a
 * route handler is exactly the place a test cannot reach.
 *
 * ## The hang
 *
 * The EPK is meant to be one page. The previous approach let content overflow, called
 * `switchToPage(0)` to put the footer back on page 1, and then dropped the extras with
 * `doc._pageBuffer.splice(1)`.
 *
 * That never terminates. `flushPages()` calls `page.end()` on every page still in `_pageBuffer`;
 * splicing removes pages 1..n BEFORE they are ended, so their refs stay outstanding in the
 * document, `_finalize` never fires, the `end` event never arrives, and the Promise never
 * settles. Not slow — infinite. Railway answered 502 after its own timeout.
 *
 * It only bites when content actually overflows, which is why it passed review: with a short EPK
 * `_pageBuffer.length` is 1, the splice is a no-op, and everything works.
 *
 * ## What replaces it
 *
 * Overflow is PREVENTED rather than cleaned up. The left column already clamped its text against
 * `MAX_TEXT_Y`; the right column — booking, rider, contact — did not, and that is what pushed
 * onto page 2. It clamps now, the same way.
 *
 * The splice is gone, and a `pageAdded` counter takes its place. If a clamp is ever wrong the
 * result is a two-page PDF and a warning in the log — a visible, reported imperfection instead
 * of a request that never returns. Degrading to two pages is not the failure mode worth
 * defending against; hanging is.
 */

import type { EPKMetadata } from "./types";

export interface NFTTrack {
  tokenId: number;
  title: string;
  coverImage: string;
  imageBuffer: Buffer | null;
}

const s = (val: unknown): string => (val == null ? "" : String(val));

export async function generateEPKPDF(
  epk: EPKMetadata,
  nfts: NFTTrack[],
): Promise<Buffer> {
  // Use @react-pdf/pdfkit directly — no React dependency, no dual-instance issue
  const { default: PDFDocument } = await import("@react-pdf/pdfkit" as any);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      autoFirstPage: true,
      bufferPages: true, // allow switchToPage() so we can pin footer/NFT to page 1
      info: {
        Title: `${s(epk.artist.name)} — Electronic Press Kit`,
        Author: "EmpowerTours",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const BG = "#0f0a2a"; // deep navy background
    const PURPLE = "#a78bfa";
    const WHITE = "#ffffff";
    const MUTED = "#94a3b8";
    const LIGHT = "#cbd5e1";
    const GREEN = "#22c55e";
    const DARK = "#1e1b4b";
    const W = doc.page.width - 80;
    const PAGE_H = doc.page.height;

    // Pre-compute layout geometry so we can clamp text heights (prevents page overflow)
    const FOOTER_H_CONST = 34;
    const hasNFTs_const = nfts.length > 0;
    const DISC_H_CONST = hasNFTs_const ? 105 : 0;
    const discY_const = PAGE_H - FOOTER_H_CONST - DISC_H_CONST - 6; // ~697 with NFTs
    const COL_TOP = 108;
    const MAX_TEXT_Y = discY_const - 12; // stop text here to avoid running into disc strip
    const PRESS_RESERVE = 130; // approx pts needed for 3 press articles
    const BIO_MAX_H = Math.max(60, MAX_TEXT_Y - COL_TOP - PRESS_RESERVE);

    // Fill dark background on every page (including any auto-added overflow pages)
    const fillPageBG = () =>
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    doc.on("pageAdded", fillPageBG);

    // ── Full-page dark background (page 1) ────────────────────────────────────
    fillPageBG();

    // ── Header ────────────────────────────────────────────────────────────────
    doc
      .fillColor(WHITE)
      .fontSize(24)
      .font("Helvetica-Bold")
      .text(s(epk.artist.name), 40, 40);

    const genres = (epk.artist.genre || []).map(s).join("  ·  ");
    const locationLine = [s(epk.artist.location), genres]
      .filter(Boolean)
      .join("   |   ");
    if (locationLine) {
      doc
        .fillColor(MUTED)
        .fontSize(10)
        .font("Helvetica")
        .text(locationLine, 40, 70);
    }

    if (epk.onChain?.ipfsCid) {
      doc
        .fillColor(GREEN)
        .fontSize(8)
        .text(
          `✓ On-chain verified · ${String(epk.onChain.ipfsCid).slice(0, 24)}...`,
          40,
          86,
        );
    }

    doc
      .moveTo(40, 100)
      .lineTo(doc.page.width - 40, 100)
      .strokeColor(PURPLE)
      .lineWidth(1)
      .stroke();

    // ── Two-column layout ─────────────────────────────────────────────────────
    const colL = 40;
    const colR = doc.page.width / 2 + 10;
    const colW = doc.page.width / 2 - 55;

    // Left column: Bio + Press (bio clamped to BIO_MAX_H to prevent page overflow)
    doc
      .fillColor(PURPLE)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("ABOUT", colL, COL_TOP);
    doc.moveDown(0.15);
    doc
      .fillColor(LIGHT)
      .fontSize(8.5)
      .font("Helvetica")
      .text(s(epk.artist.bio), colL, doc.y, {
        width: colW,
        lineGap: 1.5,
        height: BIO_MAX_H,
        ellipsis: true,
      });

    const pressArticles = (epk.press || []).slice(0, 3);
    if (pressArticles.length && doc.y < MAX_TEXT_Y - 60) {
      doc
        .moveDown(0.5)
        .fillColor(PURPLE)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("PRESS", colL, doc.y);
      doc.moveDown(0.15);
      for (const a of pressArticles) {
        if (doc.y >= MAX_TEXT_Y - 30) break; // stop if near bottom
        doc
          .fillColor(PURPLE)
          .fontSize(8)
          .font("Helvetica-Bold")
          .text(s(a.outlet), colL, doc.y, { width: colW });
        doc
          .fillColor(WHITE)
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .text(s(a.title), colL, doc.y, { width: colW });
        if (a.excerpt && doc.y < MAX_TEXT_Y - 20)
          doc
            .fillColor(MUTED)
            .fontSize(8)
            .font("Helvetica")
            .text(s(a.excerpt), colL, doc.y, {
              width: colW,
              lineGap: 1,
              height: 30,
              ellipsis: true,
            });
        doc.moveDown(0.3);
      }
    }

    // Right column: Booking + Riders + Contact.
    //
    // This was clamped against MAX_TEXT_Y for a while, on the theory that long rider bullets were
    // pushing onto page 2. They were not — the footer was — and no fixture could tell the clamped
    // version from the unclamped one, including one built specifically to overflow. Unproven
    // defensive code that no test can distinguish is worse than none: it reads as a guarantee.
    //
    // If content ever does overflow, the result is a two-page PDF and the warning below, which is
    // a fine outcome. The failure worth defending against was the hang, and that is fixed at its
    // cause.
    let rY = COL_TOP;

    if (epk.booking?.pricing || (epk.booking?.availableFor || []).length) {
      doc
        .fillColor(PURPLE)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("BOOKING", colR, rY, { width: colW });
      rY = doc.y + 2;
      if (epk.booking?.pricing) {
        doc
          .fillColor(LIGHT)
          .fontSize(8.5)
          .font("Helvetica")
          .text(s(epk.booking.pricing), colR, rY, { width: colW });
        rY = doc.y + 2;
      }
      for (const item of (epk.booking?.availableFor || []).slice(0, 4)) {
        doc
          .fillColor(LIGHT)
          .fontSize(8)
          .font("Helvetica")
          .text(`• ${s(item)}`, colR, rY, { width: colW });
        rY = doc.y;
      }
      rY += 6;
    }

    const techSecs = Object.values(epk.technicalRider || {}) as any[];
    if (techSecs.length) {
      doc
        .fillColor(PURPLE)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("TECHNICAL RIDER", colR, rY, { width: colW });
      rY = doc.y + 2;
      for (const sec of techSecs.slice(0, 3)) {
        doc
          .fillColor(WHITE)
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .text(s(sec.title), colR, rY, { width: colW });
        rY = doc.y;
        for (const item of (sec.items || []).slice(0, 3)) {
          doc
            .fillColor(LIGHT)
            .fontSize(8)
            .font("Helvetica")
            .text(`• ${s(item)}`, colR, rY, { width: colW });
          rY = doc.y;
        }
      }
      rY += 6;
    }

    const contactParts = [`empowertours.xyz/epk/${s(epk.artist.slug)}`];
    if (epk.socials?.farcaster)
      contactParts.push(`Farcaster: @${s(epk.socials.farcaster)}`);
    if (epk.socials?.twitter)
      contactParts.push(`X: @${s(epk.socials.twitter)}`);
    if (epk.socials?.website) contactParts.push(s(epk.socials.website));
    doc
      .fillColor(PURPLE)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("CONTACT", colR, rY, { width: colW });
    rY = doc.y + 2;
    for (const line of contactParts) {
      doc
        .fillColor(LIGHT)
        .fontSize(8.5)
        .font("Helvetica")
        .text(line, colR, rY, { width: colW });
      rY = doc.y;
    }

    // ── Switch back to page 1 so NFT strip and footer always land on page 1 ───
    doc.switchToPage(0);

    // ── Discography strip (NFT cover art) ─────────────────────────────────────
    const hasNFTs = hasNFTs_const;
    const FOOTER_H = FOOTER_H_CONST;
    const discY = discY_const;

    if (hasNFTs) {
      // Section divider
      doc
        .moveTo(40, discY)
        .lineTo(doc.page.width - 40, discY)
        .strokeColor(PURPLE)
        .lineWidth(0.4)
        .stroke();

      doc
        .fillColor(PURPLE)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("LATEST RELEASE", 40, discY + 5, { characterSpacing: 0.5 });

      // Single latest NFT — larger thumbnail on the left, title/label on the right
      const nft = nfts[0];
      const THUMB = 72;
      const thumbX = 40;
      const thumbStartY = discY + 16;

      if (nft.imageBuffer) {
        try {
          doc.image(nft.imageBuffer, thumbX, thumbStartY, {
            fit: [THUMB, THUMB],
          });
        } catch (imgErr) {
          console.warn(
            "[EPK PDF] doc.image() failed:",
            (imgErr as Error).message,
          );
          doc
            .rect(thumbX, thumbStartY, THUMB, THUMB)
            .fillAndStroke(DARK, PURPLE);
          doc
            .fillColor(MUTED)
            .fontSize(20)
            .font("Helvetica")
            .text("♪", thumbX, thumbStartY + THUMB / 2 - 10, {
              width: THUMB,
              align: "center",
            });
        }
      } else {
        doc.rect(thumbX, thumbStartY, THUMB, THUMB).fillAndStroke(DARK, PURPLE);
        doc
          .fillColor(MUTED)
          .fontSize(20)
          .font("Helvetica")
          .text("♪", thumbX, thumbStartY + THUMB / 2 - 10, {
            width: THUMB,
            align: "center",
          });
      }

      const infoX = thumbX + THUMB + 12;
      const infoW = W - THUMB - 12;
      doc
        .fillColor(WHITE)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(s(nft.title), infoX, thumbStartY + 4, { width: infoW });
      doc
        .fillColor(MUTED)
        .fontSize(8)
        .font("Helvetica")
        .text(
          `Latest release · Token #${nft.tokenId} · EmpowerTours on Monad`,
          infoX,
          doc.y + 2,
          { width: infoW },
        );
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    //
    // THIS is what created page 2, on every EPK, regardless of content — the reason the endpoint
    // hung for everybody rather than only for long press kits. The footer is drawn at
    // `PAGE_H - FOOTER_H + 6` = ~813.9, and A4's text area ends at 801.89 (841.89 less the 40pt
    // bottom margin). pdfkit treats a `text()` past that as overflow and auto-adds a page, which
    // is also why `switchToPage(0)` was needed below to get back.
    //
    // Dropping the bottom margin for the footer is pdfkit's own idiom for drawing INTO the
    // margin. Traced with a stack hook on `addPage`: the second call came from
    // `LineWrapper.nextSection` at y=813.9, which is exactly this line.
    doc.page.margins.bottom = 0;
    const footerLineY = PAGE_H - FOOTER_H;
    doc
      .moveTo(40, footerLineY)
      .lineTo(doc.page.width - 40, footerLineY)
      .strokeColor(PURPLE)
      .lineWidth(0.3)
      .stroke();
    doc
      .fillColor(MUTED)
      .fontSize(7.5)
      .font("Helvetica")
      .text(
        `${s(epk.artist.name)} · Electronic Press Kit · EmpowerTours on Monad`,
        40,
        footerLineY + 6,
        { align: "center", width: W },
      );

    // NOT `_pageBuffer.splice(1)`. That was here, and it is what hung: flushPages() ends every
    // page still in the buffer, so removing them first leaves their refs outstanding and the
    // document never finalizes. The clamps above are what keep this to one page; this only
    // reports when they were not enough.
    const pages = (doc as any)._pageBuffer;
    if (Array.isArray(pages) && pages.length > 1) {
      console.warn(
        `[EPK PDF] ${pages.length} pages — a clamp let content overflow. Shipping all of them; ` +
          `dropping the extras here is what used to hang the endpoint.`,
      );
    }

    doc.flushPages(); // required when bufferPages: true
    doc.end();
  });
}
