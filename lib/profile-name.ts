/**
 * The `ProfileRegistry` display-name rules, checked before spending gas.
 *
 * These mirror `ProfileRegistry._validateName` exactly. Duplicating them is deliberate: a revert
 * costs a transaction and surfaces as an opaque failure, so the difference between this and no
 * client validation is a user who is told "33 bytes — the limit is 32" versus one who is told
 * nothing and is charged for it.
 *
 * The rule most likely to be got wrong is the space rule. The contract rejects only **leading
 * and trailing** spaces (`name[0] == 0x20 || name[len-1] == 0x20`), so `Earvin Gallardo` is a
 * valid name. A validator that rejected interior spaces would block the exact case this was
 * built for, and would read as a contract limitation rather than a bug in the form.
 *
 * Lives in `lib/` rather than beside the component so it can be tested: the verify suites run
 * under `node --experimental-strip-types`, which cannot load `.tsx`.
 */

/** `ProfileRegistry.MAX_NAME_BYTES`. Bytes, not characters. */
export const MAX_NAME_BYTES = 32;

/** The contract measures `bytes(name).length`, so an emoji costs four and an accent two. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * @returns a message to show the user, or `null` when the name is valid.
 */
export function validateDisplayName(name: string): string | null {
  const bytes = byteLength(name);

  if (bytes === 0) return "Enter a name.";
  if (bytes > MAX_NAME_BYTES) {
    return `${bytes} bytes — the limit is ${MAX_NAME_BYTES}. Emoji and accents cost more than one byte each.`;
  }
  if (name.startsWith(" ") || name.endsWith(" ")) {
    return "No leading or trailing spaces. Spaces inside the name are fine.";
  }
  // C0 controls and DEL, matching the contract. Written as escapes rather than literal bytes:
  // raw control characters in source are invisible in every editor and survive no formatter.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(name)) {
    return "Control characters are not allowed.";
  }
  return null;
}
