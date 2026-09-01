"use client";

/**
 * Does this address already have a delegation that proves ownership?
 *
 * Used to decide whether a wallet prompt is worth raising. bot-command,
 * execute-delegated and register-user-safe all accept a proven delegation in
 * place of a fresh signature, so asking the user to sign when one exists is
 * friction for a fact already established.
 *
 * Returns false on any doubt — no delegation, an unproven one, a failed read.
 * A false negative costs one signature; a false positive costs a 401 the user
 * cannot act on, so the asymmetry decides the default.
 */
export async function delegationIsProven(address: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/delegation-status?address=${encodeURIComponent(address)}`,
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === true && data?.delegation?.ownershipProven === true;
  } catch {
    return false;
  }
}
