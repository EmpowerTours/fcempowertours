/**
 * Correct a geolocation country code for territories that resolve to their sovereign state.
 *
 * ## The bug this exists for
 *
 * IPInfo reports Hong Kong addresses as `CN` — an administrative classification, not an ISO one.
 * Hong Kong has its own ISO 3166-1 alpha-2 code (`HK`) and its own passport entry, so a holder
 * there got a China passport.
 *
 * That happened for real. Passport #3 was minted 2026-02-10 with `countryCode: "CN"`, and the
 * correction landed 2026-02-11 — one day late. `PassportNFTV4` has no burn and no country setter,
 * so that token is wrong permanently. The cost of getting this wrong is not a bad label; it is an
 * immutable one.
 *
 * ## Why the original fix was not enough
 *
 * It tested `city.includes("hong kong")`. IPInfo commonly returns a district instead — Kowloon,
 * Central, Sha Tin, Tsuen Wan, Yuen Long — none of which contain that string, so the correction
 * missed and the next holder would have got the same wrong passport.
 *
 * ## What this uses instead
 *
 * The IANA timezone, which is unambiguous: `Asia/Hong_Kong` and `Asia/Macau` exist precisely to
 * distinguish these places, and no mainland-China address carries them. Region and city are kept
 * as fallbacks for responses that omit the timezone, so this is strictly more permissive than
 * what it replaces — it cannot correct fewer cases than the substring check did.
 *
 * Deliberately narrow. This corrects only where a provider's classification disagrees with ISO
 * 3166-1 **and** the territory has its own passport entry. It is not a place to encode opinions
 * about sovereignty; the test is "does this have its own ISO code and its own flag in
 * `countries.ts`".
 */

export interface GeoSignals {
  /** The provider's country code, e.g. IPInfo's `country`. */
  country?: string;
  region?: string;
  city?: string;
  /** IANA timezone, e.g. `Asia/Hong_Kong`. The most reliable signal available. */
  timezone?: string;
}

interface TerritoryRule {
  /** The ISO code to correct TO. */
  code: string;
  /** The provider code this territory is wrongly reported as. */
  reportedAs: string;
  timezones: string[];
  /** Matched case-insensitively against `region`. */
  regions: string[];
  /** Matched case-insensitively as substrings of `city`. Districts included. */
  cities: string[];
}

const TERRITORIES: TerritoryRule[] = [
  {
    code: "HK",
    reportedAs: "CN",
    timezones: ["asia/hong_kong"],
    regions: ["hong kong"],
    // Districts, because IPInfo rarely returns the literal string "Hong Kong" as a city.
    cities: [
      "hong kong",
      "kowloon",
      "central",
      "sha tin",
      "shatin",
      "tsuen wan",
      "yuen long",
      "tuen mun",
      "tai po",
      "sai kung",
      "kwun tong",
      "wan chai",
      "mong kok",
      "causeway bay",
      "aberdeen",
      "stanley",
      "repulse bay",
    ],
  },
  {
    code: "MO",
    reportedAs: "CN",
    timezones: ["asia/macau", "asia/macao"],
    regions: ["macau", "macao"],
    cities: ["macau", "macao", "taipa", "coloane", "cotai"],
  },
];

const lower = (s?: string) => (s ?? "").trim().toLowerCase();

/**
 * @returns the ISO code to use, and what decided it.
 *
 * `source` is returned rather than logged so a caller can record WHY a passport got the country
 * it did. The passport is immutable; the reasoning should not be harder to recover than the
 * mistake.
 */
export function resolveTerritory(signals: GeoSignals): {
  countryCode: string;
  corrected: boolean;
  source: "provider" | "timezone" | "region" | "city";
} {
  const provider = (signals.country || "").trim().toUpperCase();
  if (!provider)
    return { countryCode: "", corrected: false, source: "provider" };

  const tz = lower(signals.timezone);
  const region = lower(signals.region);
  const city = lower(signals.city);

  for (const t of TERRITORIES) {
    if (provider !== t.reportedAs) continue;

    if (tz && t.timezones.includes(tz)) {
      return { countryCode: t.code, corrected: true, source: "timezone" };
    }
    if (region && t.regions.some((r) => region === r)) {
      return { countryCode: t.code, corrected: true, source: "region" };
    }
    // Substring, because a city field may read "Kowloon City" or "Central and Western".
    if (city && t.cities.some((c) => city.includes(c))) {
      return { countryCode: t.code, corrected: true, source: "city" };
    }
  }

  return { countryCode: provider, corrected: false, source: "provider" };
}
