/**
 * How an artist is credited in a platform cast.
 *
 * Farcaster username if they have one, else their ProfileRegistry display name,
 * else a short address. resolveArtistName owns that fallback chain — this only
 * adds the `@` where one belongs and guarantees a usable string.
 *
 * Extracted because three mint paths need it and each had its own copy of the
 * credit line. Copies of the same logic across mint_passport, mint_music and
 * mint_collector are precisely how those three drifted apart in the first place.
 *
 * Never throws. A name lookup failing must not cost the announcement; the short
 * address is a correct answer, just a less friendly one.
 */
export async function castArtistLabel(
  address: string,
  fid?: number | string | null,
): Promise<string> {
  const short = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "an artist";
  try {
    const { resolveArtistName, profileLookup } = await import(
      "@/lib/artist-name"
    );
    const { createPublicClient, http } = await import("viem");
    const { activeChain } = await import("@/app/chains");

    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });
    const resolved = await resolveArtistName(address, {
      fid: fid ? Number(fid) : undefined,
      lookupProfile: profileLookup(
        client as Parameters<typeof profileLookup>[0],
        process.env.NEXT_PUBLIC_PROFILE_REGISTRY as `0x${string}` | undefined,
      ),
    });
    if (!resolved.display) return short;
    return resolved.source === "farcaster" ||
      resolved.source === "farcaster-fid"
      ? `@${resolved.display}`
      : resolved.display;
  } catch {
    return short;
  }
}
