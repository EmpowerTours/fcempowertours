/**
 * The radio play ledger: one key, one cap, in one place.
 *
 * ## Why this file exists
 *
 * Plays are not contract state — re-checked against all three candidates, and none keeps a
 * per-song counter — so the only per-song record is a Redis list the live-radio route writes.
 * That list is trimmed, which makes every count read off it a FLOOR rather than a total once it
 * fills.
 *
 * It filled. `/api/artist-earnings` reported `totalPlays: 100` against a contract lifetime of 5,
 * and the per-song breakdown summed to exactly 100 — the cap, not a measurement. Nothing in the
 * response said so.
 *
 * ## Why the cap has to be shared rather than commented
 *
 * The trim lived as a bare `99` in two places in the writer, and the readers encoded the matching
 * `100` in prose. Detecting saturation against a hard-coded 100 would be correct only until
 * somebody changed the trim, and then it would be wrong silently — the readers would call a full
 * ledger unsaturated and go back to presenting a floor as a count. One constant, used by the
 * writer's `ltrim` and by every reader's comparison, is what makes the check hold.
 *
 * `ltrim(key, 0, CAP - 1)` keeps CAP entries. Writing the off-by-one out here rather than at each
 * call site is the point.
 */

/** The Redis list the live-radio route appends each play to, newest first. */
export const PLAY_HISTORY_KEY = "live-radio:play-history";

/** How many plays the ledger keeps. Beyond this the oldest are dropped. */
export const PLAY_HISTORY_CAP = 100;

/** The `stop` index for `ltrim`, so no call site repeats the off-by-one. */
export const PLAY_HISTORY_TRIM_STOP = PLAY_HISTORY_CAP - 1;

export interface PlayWindow<T> {
  /** Newest first, at most `cap` entries. */
  plays: T[];
  /**
   * True when the ledger came back full.
   *
   * A count taken from a saturated window is a **floor**: there were at least this many plays,
   * and older ones have been dropped. Callers must not present it as a total.
   */
  saturated: boolean;
  cap: number;
}

/**
 * Read the ledger and say whether it is full.
 *
 * Entries that do not parse are skipped rather than throwing — one malformed write must not cost
 * the whole window — but they still count toward saturation, because the ledger held them.
 */
export function toPlayWindow<T>(
  raw: unknown[],
  parse: (entry: unknown) => T | null,
): PlayWindow<T> {
  const plays: T[] = [];
  for (const entry of raw) {
    const parsed = parse(entry);
    if (parsed !== null) plays.push(parsed);
  }
  return {
    plays,
    // Against the raw length, not the parsed one: a window that came back full is saturated even
    // if half of it failed to parse.
    saturated: raw.length >= PLAY_HISTORY_CAP,
    cap: PLAY_HISTORY_CAP,
  };
}

/**
 * How to describe a count taken from this window, for a caller assembling an `unavailable`-style
 * list. Empty when the window is not saturated.
 */
export function saturationNote(saturated: boolean, what: string): string[] {
  return saturated
    ? [
        `${what} is a floor, not a total — the play ledger is at its ${PLAY_HISTORY_CAP}-entry cap`,
      ]
    : [];
}
