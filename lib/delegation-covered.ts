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
  // send_tours is NOT here on purpose. create-delegation classifies it
  // HIGH_RISK and never grants it by default, so listing it made the client
  // skip the wallet prompt for a permission the delegation does not hold --
  // a 401 with nothing to click, which is the exact drift this file warns
  // about. A transfer should cost a signature anyway.
  "buy_music",
  // Added 2026-09-03. Every radio action asked for a fresh wallet signature on
  // every press, because none was listed here -- so pressing Skip Random opened
  // MetaMask with a message to sign and nothing to approve, which reads as a
  // broken button.
  //
  // Not a meaningful broadening: skipping costs 1 MON, a shoutout 0.5, an ad 2,
  // against a list that already authorises mint_passport at 150 WMON and
  // buy_music at whatever a licence costs. The bound that matters is the
  // delegation's own -- 24 hours, a capped transaction count, and a wallet
  // signature to create it -- not the length of this list.
  "radio_skip_random",
  "radio_voice_note",
  "radio_queue_song",
] as const;

/**
 * True when a proven delegation authorises this auth context on its own, so the
 * caller must NOT pay a wallet prompt for it.
 *
 * Anything outside the list still needs a signature: the delegation genuinely
 * does not cover it, and silently sending nothing would fail closed with no
 * way for the user to recover.
 */
/**
 * Contexts a proven delegation authorises without naming one of its listed
 * permissions.
 *
 * Registering the Safe is a prerequisite of using a delegation at all — an
 * unregistered Safe cannot mint, so every permission the delegation holds is
 * inert until it runs. Asking for a second signature to do it re-proves the
 * fact the delegation already carries, which is why a first mint cost two
 * wallet prompts instead of one.
 */
const DELEGATION_COVERED_CONTEXTS = ["register-user-safe"] as const;

export function delegationCovers(context: string): boolean {
  if ((DELEGATION_COVERED_CONTEXTS as readonly string[]).includes(context)) {
    return true;
  }
  const match = /^execute-delegated:(.+)$/.exec(context);
  if (!match) return false;
  return (DELEGATION_PERMISSIONS as readonly string[]).includes(match[1]);
}
