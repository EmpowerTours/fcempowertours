"use client";

/**
 * Is the server on the v3 contracts? Asked of the server, not inferred.
 *
 * `isV3Contracts()` reads NEXT_PUBLIC_CONTRACTS_V3, which Next inlines into the
 * client bundle at BUILD time while the server reads it at RUNTIME. If the
 * variable is not present in the build environment those two disagree, and they
 * did: config-check reported contractsV3 true while the browser skipped signing
 * the MintRequest, so every collector mint was refused with "mintRequest must be
 * an object" — correct code on both sides, disagreeing about which contracts
 * were live.
 *
 * The server is the authority: it is the side that calls SalesController. Ask it
 * rather than trusting a value frozen at build time.
 *
 * Fails CLOSED to true. A signature we did not need is a wasted prompt on the
 * legacy path, where the relayer ignores it; a signature we needed and skipped
 * is a mint that cannot succeed.
 */
let cached: boolean | null = null;

export async function serverUsesV3(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const res = await fetch("/api/config-check");
    if (!res.ok) return true;
    const data = await res.json();
    const value = data?.env?.contractsV3;
    cached = typeof value === "boolean" ? value : true;
    return cached;
  } catch {
    return true;
  }
}
