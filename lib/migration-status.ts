/**
 * Has this legacy track already been re-published into v3?
 *
 * ## Why this is a module
 *
 * It was four lines inside `CatalogueMigration.tsx`, and it was wrong in a way that offered to
 * mint a second copy of every track the artist owns. Logic that decides whether to spend money
 * does not belong somewhere nothing can call it.
 *
 * ## The bug it encodes against
 *
 * The check was "is there a v3 master with this tokenURI whose artist is the connected wallet".
 * The v3 re-publish was run from the deployer key — `mintMaster` sets the artist to `msg.sender`
 * — so every v3 master's artist is the deployer while the connected wallet is the artist. Nothing
 * matched. All five tracks read as pending, and the card invited the artist to migrate a
 * catalogue that was already migrated.
 *
 * The fid is what bridges them: the legacy row and the v3 master both carry it, and the migration
 * passes it through unchanged.
 *
 * ## Why the URI alone is not enough
 *
 * A matching tokenURI proves the same metadata document, not the same owner. Two artists could
 * point at one document — a cover, a re-release, or simple mischief — and treating that as
 * "already migrated" would silently refuse to migrate somebody's real track. So a URI match is
 * necessary and an owner-or-fid match is also required.
 */

export interface V3Master {
  id: number;
  /** `getMaster().artist` — the address that minted it, which may not be the artist. */
  artist: string;
  /** `getMaster().artistFid`, 0 when none was recorded. */
  fid: bigint;
}

export interface LegacyRow {
  /** `masterTokens().artistFid`. */
  fid: bigint;
}

/**
 * @returns the v3 token id this legacy track was migrated to, or `undefined` if it has not been.
 */
export function migratedAs(
  v3: V3Master | undefined,
  legacy: LegacyRow,
  walletAddress: string,
): number | undefined {
  if (!v3) return undefined;

  const sameOwner =
    Boolean(walletAddress) &&
    v3.artist.toLowerCase() === walletAddress.toLowerCase();

  // `> 0n` matters: fid is optional on both contracts, and two tracks that merely both lack one
  // are not the same track. Without it, every fid-less legacy row would match every fid-less v3
  // master sharing a URI.
  const sameFid = legacy.fid > 0n && v3.fid === legacy.fid;

  return sameOwner || sameFid ? v3.id : undefined;
}
