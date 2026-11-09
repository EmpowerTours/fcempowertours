/**
 * Art must reach the home page the same way music does, newest first.
 *
 * Run: `node --experimental-strip-types tools/verify-home-feed-shows-art.ts`
 *
 * ## What this is defending
 *
 * As of 2026-11-08 no art has been minted, so nothing on the live site would show if art were
 * silently dropped or mislabelled — the first artist to upload a drawing would be the one to find
 * out. The path has five links and every one has to agree on what "art" is:
 *
 *   upload form  -> signs nftType 1 into the artist's MintRequest
 *   mint route   -> is_art -> nftTypeValue 1
 *   catalogue    -> isArt = (nftType === 1)
 *   /api/nfts    -> type "ART"
 *   home page    -> the globe (CrystalBall) and the "Recent NFTs" row render "ART"
 *
 * The feed is also newest first. It used to be shuffled, so a fresh mint — song or drawing —
 * landed in a random slot of a row the page now calls "Recent".
 */

import { readFileSync } from "node:fs";

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const failures: string[] = [];
let checks = 0;
function check(name: string, ok: boolean) {
  checks++;
  if (!ok) failures.push(name);
}

const form = read("app/components/oracle/CreateNFTModal.tsx");
check(
  "the upload form signs nftType 1 for art",
  /nftType:\s*nftType === "art" \? 1 : 0/.test(form),
);

const route = read("app/api/execute-delegated/route.ts");
check(
  "the mint route maps art to nftType 1",
  /const nftTypeValue = isArtNFT \? 1 : 0;/.test(route),
);

const source = read("lib/catalogue-source.ts");
check(
  "the catalogue reads nftType 1 as art (v3 and legacy)",
  (source.match(/isArt: Number\([^)]*\) === 1/g) ?? []).length >= 2,
);

const feed = read("app/api/nfts/route.ts");
check(
  "the home feed labels art as ART",
  /type: nft\.isArt \? "ART" : "MUSIC"/.test(feed),
);
check(
  "the home feed does not filter art out",
  !/\.filter\([^)]*isArt/.test(feed),
);
check("the home feed is not shuffled", !/Math\.random/.test(feed));
check(
  "the home feed is newest first",
  /\.sort\(\s*\(a, b\) => Number\(b\.tokenId\) - Number\(a\.tokenId\)/.test(
    feed,
  ),
);

const globe = read("app/components/oracle/CrystalBall.tsx");
check("the globe reads the home feed", /fetch\("\/api\/nfts"\)/.test(globe));
check("the globe renders ART", /case "ART":/.test(globe));

const page = read("app/oracle/page.tsx");
check("the row under the globe is labelled Recent", />Recent NFTs</.test(page));
check("the row renders an ART placeholder", /nft\.type === "ART"/.test(page));

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ art reaches the home page, newest first\n");
