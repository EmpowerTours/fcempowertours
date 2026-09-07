import { getCountryByCode } from "./countries";

const PINATA_GATEWAY =
  process.env.PINATA_GATEWAY || "harlequin-used-hare-224.mypinata.cloud";

export interface PassportStamp {
  /**
   * Did someone other than the passport holder attest this?
   *
   * It matters because addVenueStamp lets `_ownerOf(tokenId)` stamp their own
   * passport, and `verified` is a parameter the caller supplies rather than
   * something the contract checks. So a self-recorded stamp and an
   * artist-attested one are indistinguishable in the data unless the artwork
   * distinguishes them — and a stamp you can apply to yourself is a sticker.
   *
   * Undefined is treated as unattested, because reject-by-default is the only
   * safe reading of a missing claim.
   */
  verified?: boolean;
  locationName: string;
  city: string;
  country: string;
  stampedAt: number;
  stampImageIPFS?: string; // AI-generated stamp image from Nano Banana
  experienceType?: string;
}

/**
 * The passport artwork.
 *
 * ## Why it looks like this
 *
 * The first version was a bright blue gradient with Arial, a 120px flag emoji, a
 * red rubber stamp and six rainbow stamp colours. It read as a generated card
 * rather than a document.
 *
 * Real passports are engraved instruments, and almost all of their character
 * comes from four things: a deep muted ground, guilloché line-work, letterspaced
 * serif type, and a machine-readable zone. None of that is decoration — the
 * guilloché exists to defeat copying, the MRZ to be scanned — which is exactly
 * why it looks authoritative instead of styled.
 *
 * ## Constraints this design has to respect
 *
 * Wallets render SVG with system fonts and load nothing, so only generic families
 * are usable: `Georgia, 'Times New Roman', serif` and `'Courier New', monospace`.
 * A webfont would silently fall back and wreck the letterspacing.
 *
 * The flag emoji is gone. It rendered at 120px as the loudest element on the
 * card, and emoji flags do not render as flags at all on Windows and several
 * Android builds — a tofu box in the centre of the artwork. The country CODE set
 * large in a serif carries the same information and cannot fail to render.
 */

const INK = "#0E1418"; // deep near-black ground
const GOLD = "#B08D57"; // foil accent
const GOLD_LIGHT = "#D4B87F";
const MUTED = "#8A9299";
const PAPER = "#F2EEE6";

/** Rings the visa area can hold without touching the MRZ. Measured, not chosen. */
export const MAX_STAMPS_SHOWN = 6;

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const MONO = "'Courier New', Courier, monospace";

/**
 * "Passport" in the issuing country's own language.
 *
 * Real passports print the term in the national language, with English (and
 * often French) alongside — it is one of the few pieces of text on the cover,
 * and getting it right is most of what makes a document look issued rather than
 * designed. A single hardcoded "PASAPORTE" on a French or Japanese passport is
 * the kind of detail that reads as a template.
 *
 * Latin-script terms only where the script is Latin; CJK, Cyrillic, Arabic,
 * Greek, Devanagari and Thai are given in their own scripts, which system fonts
 * cover even though Georgia itself does not — the browser falls back per glyph.
 * Countries not listed fall back to English alone, which is honest rather than
 * wrong: better one correct word than a confidently incorrect translation.
 */
const PASSPORT_WORD: Record<string, string> = {
  // Spanish
  MX: "PASAPORTE",
  ES: "PASAPORTE",
  AR: "PASAPORTE",
  CO: "PASAPORTE",
  PE: "PASAPORTE",
  CL: "PASAPORTE",
  VE: "PASAPORTE",
  EC: "PASAPORTE",
  GT: "PASAPORTE",
  CU: "PASAPORTE",
  BO: "PASAPORTE",
  DO: "PASAPORTE",
  HN: "PASAPORTE",
  PY: "PASAPORTE",
  SV: "PASAPORTE",
  NI: "PASAPORTE",
  CR: "PASAPORTE",
  PA: "PASAPORTE",
  UY: "PASAPORTE",
  GQ: "PASAPORTE",
  // Portuguese
  PT: "PASSAPORTE",
  BR: "PASSAPORTE",
  AO: "PASSAPORTE",
  MZ: "PASSAPORTE",
  // French
  FR: "PASSEPORT",
  BE: "PASSEPORT",
  SN: "PASSEPORT",
  CI: "PASSEPORT",
  ML: "PASSEPORT",
  NE: "PASSEPORT",
  BF: "PASSEPORT",
  TD: "PASSEPORT",
  MG: "PASSEPORT",
  CM: "PASSEPORT",
  CD: "PASSEPORT",
  HT: "PASSEPORT",
  MC: "PASSEPORT",
  LU: "PASSEPORT",
  // Germanic
  DE: "REISEPASS",
  AT: "REISEPASS",
  CH: "REISEPASS",
  NL: "PASPOORT",
  SE: "PASS",
  NO: "PASS",
  DK: "PAS",
  IS: "VEGABRÉF",
  FI: "PASSI",
  // Italian
  IT: "PASSAPORTO",
  SM: "PASSAPORTO",
  VA: "PASSAPORTO",
  // Slavic & Baltic
  PL: "PASZPORT",
  CZ: "CESTOVNÍ PAS",
  SK: "CESTOVNÝ PAS",
  SI: "POTNI LIST",
  HR: "PUTOVNICA",
  RS: "ПАСОШ",
  BG: "ПАСПОРТ",
  RU: "ПАСПОРТ",
  UA: "ПАСПОРТ",
  BY: "ПАШПАРТ",
  LT: "PASAS",
  LV: "PASE",
  EE: "PASS",
  // Other European
  GR: "ΔΙΑΒΑΤΗΡΙΟ",
  HU: "ÚTLEVÉL",
  RO: "PAȘAPORT",
  MD: "PAȘAPORT",
  TR: "PASAPORT",
  AL: "PASAPORTË",
  IE: "PAS",
  // Asia
  CN: "护照",
  TW: "護照",
  HK: "護照",
  JP: "旅券",
  KR: "여권",
  TH: "หนังสือเดินทาง",
  VN: "HỘ CHIẾU",
  ID: "PASPOR",
  MY: "PASPORT",
  PH: "PASAPORTE",
  IN: "पासपोर्ट",
  NP: "राहदानी",
  BD: "পাসপোর্ট",
  PK: "پاسپورٹ",
  LK: "ගමන් බලපත්‍රය",
  MM: "နိုင်ငံကူးလက်မှတ်",
  KH: "លិខិតឆ្លងដែន",
  MN: "ГАДААД ПАСПОРТ",
  KZ: "ПАСПОРТ",
  // Middle East & North Africa
  SA: "جواز سفر",
  AE: "جواز سفر",
  EG: "جواز سفر",
  JO: "جواز سفر",
  IQ: "جواز سفر",
  KW: "جواز سفر",
  QA: "جواز سفر",
  OM: "جواز سفر",
  BH: "جواز سفر",
  LB: "جواز سفر",
  SY: "جواز سفر",
  YE: "جواز سفر",
  LY: "جواز سفر",
  TN: "جواز سفر",
  DZ: "جواز سفر",
  MA: "جواز سفر",
  IL: "דרכון",
  IR: "گذرنامه",
  AF: "پاسپورت",
  // Africa
  ET: "ፓስፖርት",
  ER: "ፓስፖርት",
};

/** The cover line: the native term, then English, the way a cover is printed. */
function passportLine(countryCode: string): string {
  const native = PASSPORT_WORD[countryCode.toUpperCase()];
  return native ? `${native} \u00B7 PASSPORT` : "PASSPORT";
}

/** Resolve a stamp's artwork reference to a fetchable URL, or null. */
function stampArtworkURL(ref?: string): string | null {
  if (!ref) return null;
  if (ref.startsWith("http")) return ref;
  const cid = ref.startsWith("ipfs://") ? ref.slice("ipfs://".length) : ref;
  return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
}

/** XML-escape. A country name containing & or < would otherwise break the SVG. */
function esc(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Guilloché rosette — the interference pattern engraved on banknotes and
 * passports. Concentric ellipses each rotated a little further produce it; the
 * moiré is the point, so the strokes are hairline and nearly transparent.
 */
function guilloche(cx: number, cy: number, rings: number): string {
  let out = "";
  for (let i = 0; i < rings; i++) {
    const angle = (180 / rings) * i;
    const rx = 150 - i * 1.5;
    const ry = 58 + i * 0.6;
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${GOLD}" stroke-width="0.4" opacity="0.09" transform="rotate(${angle.toFixed(1)} ${cx} ${cy})"/>`;
  }
  return out;
}

/**
 * ICAO 9303-style machine readable zone. Not a real travel document number and
 * deliberately not formatted as one — it encodes the token id and country so the
 * strip carries the same facts as the card above it.
 */
function mrz(
  countryCode: string,
  countryName: string,
  tokenId: number,
): string {
  const pad = (v: string, n: number) => v.slice(0, n).padEnd(n, "<");
  const cc = countryCode
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  const name = countryName.toUpperCase().replace(/[^A-Z]/g, "<");
  const l1 = pad(`P<${cc}EMPOWERTOURS<<${name}`, 44);
  const l2 = pad(`${String(tokenId).padStart(9, "0")}<${cc}MONAD143`, 44);
  return `${l1}\n${l2}`;
}

// Generate SVG passport image with country info and optional stamps
export function generatePassportSVG(
  countryCode: string,
  countryName: string,
  tokenId: number,
  stamps: PassportStamp[] = [],
): string {
  const country = getCountryByCode(countryCode);
  const region = country?.region || "Unknown Region";
  const continent = country?.continent || "Unknown";

  const code = countryCode.toUpperCase();
  const nameSize =
    countryName.length > 18 ? 19 : countryName.length > 13 ? 23 : 27;
  // Escaped: an MRZ is mostly "<" filler, which is an open tag to an XML parser.
  // Unescaped, the strip rendered as the single character "P".
  const [mrz1, mrz2] = mrz(countryCode, countryName, tokenId)
    .split("\n")
    .map(esc);

  const svg = `<svg width="400" height="600" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="600" fill="${INK}"/>

  <!-- guilloché, behind everything -->
  <g>${guilloche(200, 250, 26)}</g>

  <!-- double hairline border, the way a document is ruled rather than framed -->
  <rect x="14" y="14" width="372" height="572" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.55"/>
  <rect x="19" y="19" width="362" height="562" fill="none" stroke="${GOLD}" stroke-width="0.4" opacity="0.3"/>

  <!-- header -->
  <text x="200" y="58" font-family="${SERIF}" font-size="13" fill="${GOLD_LIGHT}" text-anchor="middle" letter-spacing="6">EMPOWERTOURS</text>
  <line x1="120" y1="70" x2="280" y2="70" stroke="${GOLD}" stroke-width="0.5" opacity="0.5"/>
  <text x="200" y="88" font-family="${SERIF}" font-size="9" fill="${MUTED}" text-anchor="middle" letter-spacing="3">${esc(passportLine(countryCode))}</text>

  <!-- serial, set as a document reference rather than a rubber stamp -->
  <text x="366" y="44" font-family="${MONO}" font-size="9" fill="${MUTED}" text-anchor="end" letter-spacing="1">No. ${String(tokenId).padStart(6, "0")}</text>

  <!-- the country, carried by the code so nothing depends on emoji support -->
  <text x="200" y="252" font-family="${SERIF}" font-size="104" fill="${PAPER}" text-anchor="middle" letter-spacing="8" opacity="0.95">${esc(code)}</text>
  <text x="200" y="292" font-family="${SERIF}" font-size="${nameSize}" fill="${GOLD_LIGHT}" text-anchor="middle" letter-spacing="4">${esc(countryName.toUpperCase())}</text>

  <line x1="60" y1="318" x2="340" y2="318" stroke="${GOLD}" stroke-width="0.5" opacity="0.4"/>

  <!-- data rows, as a passport data page sets them: label above value -->
  <text x="60"  y="344" font-family="${SERIF}" font-size="7.5" fill="${MUTED}" letter-spacing="2">REGION</text>
  <text x="60"  y="360" font-family="${SERIF}" font-size="12" fill="${PAPER}" letter-spacing="1">${esc(region)}</text>
  <text x="340" y="344" font-family="${SERIF}" font-size="7.5" fill="${MUTED}" letter-spacing="2" text-anchor="end">CONTINENT</text>
  <text x="340" y="360" font-family="${SERIF}" font-size="12" fill="${PAPER}" letter-spacing="1" text-anchor="end">${esc(continent)}</text>

  <line x1="60" y1="378" x2="340" y2="378" stroke="${GOLD}" stroke-width="0.5" opacity="0.25"/>

  ${generateStampsSection(stamps)}

  <!-- machine readable zone -->
  <rect x="19" y="518" width="362" height="63" fill="${PAPER}" opacity="0.055"/>
  <line x1="19" y1="518" x2="381" y2="518" stroke="${GOLD}" stroke-width="0.5" opacity="0.4"/>
  <text x="32" y="544" font-family="${MONO}" font-size="10.5" fill="${PAPER}" opacity="0.75" letter-spacing="0.6">${mrz1}</text>
  <text x="32" y="564" font-family="${MONO}" font-size="10.5" fill="${PAPER}" opacity="0.75" letter-spacing="0.6">${mrz2}</text>
</svg>`;

  return svg.trim();
}

/**
 * The visa pages. Empty is the normal state for a new passport and is set as a
 * ruled blank rather than an advert — a document does not tell you to buy things.
 */
function generateStampsSection(stamps: PassportStamp[]): string {
  if (stamps.length === 0) {
    return `
  <text x="200" y="424" font-family="${SERIF}" font-size="8" fill="${MUTED}" text-anchor="middle" letter-spacing="3">VISAS &amp; ENDORSEMENTS</text>
  <line x1="90" y1="444" x2="310" y2="444" stroke="${GOLD}" stroke-width="0.4" opacity="0.22"/>
  <line x1="90" y1="468" x2="310" y2="468" stroke="${GOLD}" stroke-width="0.4" opacity="0.16"/>
  <line x1="90" y1="492" x2="310" y2="492" stroke="${GOLD}" stroke-width="0.4" opacity="0.1"/>`;
  }

  // SIX is the ceiling, and it is a measurement rather than a preference: the
  // visa area runs from the data rules to the MRZ at y=518, which is two rows of
  // r=23 rings and no more. The first version used r=26 at y=452/506, so the
  // second row ran to y=532 and sat ON the machine-readable zone — visible only
  // once a passport with six stamps was actually rendered.
  //
  // A touring artist will pass six quickly, so the count at the right is the real
  // total and the rings are the six most recent. That is also how a physical
  // passport reads: the page shows recent entries, not your whole life.
  const shown = stamps.slice(0, MAX_STAMPS_SHOWN);
  let out = `
  <text x="60" y="398" font-family="${SERIF}" font-size="8" fill="${MUTED}" letter-spacing="3">VISAS &amp; ENDORSEMENTS</text>
  <text x="340" y="398" font-family="${MONO}" font-size="8" fill="${MUTED}" text-anchor="end">${stamps.length}</text>`;

  shown.forEach((stamp, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 78 + col * 110;
    const y = 436 + row * 52;
    // A real stamp is struck by hand, so it is never quite square to the page.
    const rot = ((i * 11) % 13) - 6;
    const date = new Date(stamp.stampedAt * 1000)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })
      .toUpperCase();
    // The inner ring is 36px across, so the label gets about nine characters at
    // the smallest size that stays legible. "GUADALAJARA" crossed the outer ring
    // at every size that fit it whole, which is the one thing a struck stamp
    // never does — so it truncates. Measured by rendering six of them, not
    // reasoned about: the first two attempts both overflowed.
    const raw = (stamp.city || stamp.locationName || "").toUpperCase();
    const place = esc(raw.length > 9 ? raw.slice(0, 8) + "\u2026" : raw);
    const placeSize = raw.length > 7 ? 5.8 : raw.length > 5 ? 6.6 : 7.4;
    // A stamp may carry generated artwork. When it does the image fills the ring
    // and the ring becomes its frame; when it does not the ring is struck as
    // type. Dropping the image path in the redesign would have silently removed
    // a capability — no passport carries stamps yet, so nothing would have
    // complained until the first one did.
    // Attested stamps are STRUCK: a double ring, full opacity, paper-white text.
    // Self-recorded ones are PENCILLED: a single dashed hairline, dimmer, and no
    // second ring. A fan can log any show they went to and it still looks like a
    // record — it just does not look like something the artist signed.
    const attested = stamp.verified === true;
    const ringOpacity = attested ? 0.75 : 0.32;
    const ringWidth = attested ? 1.1 : 0.6;
    const dash = attested ? "" : ` stroke-dasharray="2.5 2.5"`;
    const textFill = attested ? PAPER : MUTED;
    const art = stampArtworkURL(stamp.stampImageIPFS);
    const inner = art
      ? `<defs><clipPath id="stamp${i}"><circle r="18"/></clipPath></defs>
    <image href="${esc(art)}" x="-18" y="-18" width="36" height="36" clip-path="url(#stamp${i})" preserveAspectRatio="xMidYMid slice"/>
    <text y="30" font-family="${MONO}" font-size="5.6" fill="${GOLD_LIGHT}" text-anchor="middle">${date}</text>`
      : `${attested ? `<circle r="18" fill="none" stroke="${GOLD_LIGHT}" stroke-width="0.4" opacity="0.45"/>` : ""}
    <text y="-3" font-family="${SERIF}" font-size="${placeSize}" fill="${textFill}" text-anchor="middle" letter-spacing="0.4" opacity="0.9">${place}</text>
    <text y="7" font-family="${MONO}" font-size="6" fill="${GOLD_LIGHT}" text-anchor="middle">${date}</text>`;

    out += `
  <g transform="translate(${x} ${y}) rotate(${rot})" opacity="${attested ? 0.85 : 0.6}">
    <circle r="23" fill="none" stroke="${GOLD_LIGHT}" stroke-width="${ringWidth}" opacity="${ringOpacity}"${dash}/>
    ${inner}
  </g>`;
  });
  return out;
}

export function svgToDataURI(svg: string): string {
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

// Generate complete NFT metadata with image
export function generatePassportMetadata(
  countryCode: string,
  countryName: string,
  tokenId: number,
  stamps: PassportStamp[] = [],
): object {
  const svg = generatePassportSVG(countryCode, countryName, tokenId, stamps);
  const imageDataURI = svgToDataURI(svg);
  const country = getCountryByCode(countryCode);

  return {
    name: `EmpowerTours Passport - ${countryName}`,
    description: `Digital passport NFT for ${countryName}. Collect venue stamps as you explore events and climbing locations. Unlock exclusive benefits. Part of a collection representing all 195 countries on Monad.`,
    image: imageDataURI, // SVG embedded as base64
    external_url: `https://fcempowertours-production-6551.up.railway.app/passport/${tokenId}`,
    attributes: [
      {
        trait_type: "Country",
        value: countryName,
      },
      {
        trait_type: "Country Code",
        value: countryCode,
      },
      {
        trait_type: "Continent",
        value: country?.continent || "Unknown",
      },
      {
        trait_type: "Region",
        value: country?.region || "Unknown",
      },
      {
        trait_type: "Type",
        value: "Passport NFT",
      },
      {
        trait_type: "Features",
        value: "Venue Stamps, Climbing Badges",
      },
      {
        trait_type: "Token ID",
        value: tokenId.toString(),
      },
      {
        trait_type: "Mint Date",
        value: new Date().toISOString().split("T")[0],
      },
      {
        trait_type: "Network",
        value: "Monad",
      },
      {
        trait_type: "Collection",
        value: "195 Countries",
      },
    ],
  };
}

// Validate country code
export function isValidCountryCode(code: string): boolean {
  return getCountryByCode(code) !== undefined;
}
