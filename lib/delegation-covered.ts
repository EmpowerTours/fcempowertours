/**
 * Actions a delegation is created with permission for.
 *
 * Kept in one place because two things must agree: the permission list the
 * client requests when creating a delegation, and the client's decision not to
 * ask for a wallet signature because the delegation already covers the action.
 * If those drift, the user gets a 401 with no prompt and no way forward.
 */
export const DELEGATION_PERMISSIONS = [
  "mint_passport",
  "wrap_mon",
  "mint_music",
  "swap_mon_for_tours",
  "send_tours",
  "buy_music",
] as const;

/**
 * True when a proven delegation authorises this auth context on its own, so the
 * caller must NOT pay a wallet prompt for it.
 *
 * Anything outside the list still needs a signature: the delegation genuinely
 * does not cover it, and silently sending nothing would fail closed with no
 * way for the user to recover.
 */
export function delegationCovers(context: string): boolean {
  const match = /^execute-delegated:(.+)$/.exec(context);
  if (!match) return false;
  return (DELEGATION_PERMISSIONS as readonly string[]).includes(match[1]);
}
