import { getDelegation } from "@/lib/delegation-system";
import { delegationSessionMatches } from "@/lib/delegation-session";

/**
 * Does an existing delegation prove the caller owns `userAddress`?
 *
 * A delegation is only created after ownership is PROVEN — a verified Quick
 * Auth token or a verified wallet signature — and that fact is recorded on it
 * as `ownershipProven`. So the delegation is itself the proof, and asking the
 * user to sign again establishes nothing the delegation did not already
 * establish. It is the same fact twice, at the cost of a second wallet prompt.
 *
 * The session secret binds that proof to the browser that created it. Without
 * it, knowing only the address would be enough to spend during the window.
 *
 * `action`, when given, must appear in the delegation's permission list, so
 * this can never authorise something the user did not agree to. Omit it for
 * platform operations that are a prerequisite of using the delegation at all
 * rather than one of its listed actions.
 *
 * Fails closed on every uncertainty: no delegation, an expired one, one created
 * before `ownershipProven` existed, a missing/mismatched session secret, or a
 * Redis error all return false and send the caller back to a signature.
 */
export async function delegationProvesOwnership(
  userAddress: string,
  action?: string,
  sessionSecret?: string | null,
): Promise<boolean> {
  try {
    const delegation = await getDelegation(userAddress);
    if (delegation?.ownershipProven !== true) return false;
    if (!(delegation.expiresAt > Date.now())) return false;
    if (
      !delegationSessionMatches(
        sessionSecret,
        delegation.sessionSecretHash ?? null,
      )
    ) {
      return false;
    }
    if (action === undefined) return true;
    return (
      Array.isArray(delegation.config?.permissions) &&
      delegation.config.permissions.includes(action)
    );
  } catch {
    return false;
  }
}
