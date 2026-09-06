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
 * Where a legacy track stands relative to v3.
 *
 * ## Why "migrated" was not enough
 *
 * This used to answer yes/no, and it counted a deployer-minted copy carrying the artist's fid as
 * a yes. That was right about presence and wrong about ownership, and the difference is the whole
 * point of v3: `mintMaster` sets the artist to `msg.sender`, so a track the platform minted says
 * the PLATFORM is the artist. Reporting that as migrated hid two of unify34's tracks — "Money
 * Making Machine" and "Suddenly" — behind a green tick, with the deployer's address on them and
 * no way in the UI to correct it.
 *
 * So presence and attribution are now separate answers:
 *
 *   pending       nothing at this URI in v3
 *   migrated      a v3 copy exists AND its artist is this wallet — nothing to do
 *   misattributed a v3 copy exists carrying this fid, but somebody else minted it. The recording
 *                 is there; the credit is wrong. Re-publishing mints a correctly attributed copy,
 *                 after which the old one should be suspended.
 */
export type MigrationState =
  | { kind: "pending" }
  | { kind: "migrated"; id: number }
  | { kind: "misattributed"; id: number };

/**
 * @param v3 every v3 master sharing this legacy track's tokenURI.
 *
 * A URI can have SEVERAL masters — that is exactly what a re-publish creates — so this takes all
 * of them and prefers the artist's own. Passing only one (the previous shape) made the answer
 * depend on which copy the caller happened to keep: a map keyed by URI silently kept the last one
 * written, so the result was correct for the tracks unify34 had re-published and wrong for the
 * ones she had not, entirely by accident of iteration order.
 */
export function migrationState(
  v3: readonly V3Master[] | undefined,
  legacy: LegacyRow,
  walletAddress: string,
): MigrationState {
  if (!v3 || v3.length === 0) return { kind: "pending" };

  const wallet = walletAddress.toLowerCase();
  const owned = wallet
    ? v3.find((m) => m.artist.toLowerCase() === wallet)
    : undefined;
  if (owned) return { kind: "migrated", id: owned.id };

  // `> 0n` matters: fid is optional on both contracts, and two tracks that merely both lack one
  // are not the same track. Without it, every fid-less legacy row would match every fid-less v3
  // master sharing a URI.
  const byFid =
    legacy.fid > 0n ? v3.find((m) => m.fid === legacy.fid) : undefined;
  if (byFid) return { kind: "misattributed", id: byFid.id };

  return { kind: "pending" };
}
