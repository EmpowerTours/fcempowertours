"use client";

import { DELEGATION_SESSION_HEADER } from "@/lib/delegation-session-header";

const storageKey = (address: string) =>
  `et-delegation-session:${address.toLowerCase()}`;

/** Persist the one-time session secret returned by create-delegation. */
export function storeDelegationSession(
  address: string,
  secret: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  if (!address || !secret || !/^[a-f0-9]{64}$/i.test(secret)) return;
  try {
    sessionStorage.setItem(storageKey(address), secret.toLowerCase());
  } catch {
    // Private mode / quota — spend will fall back to a fresh signature.
  }
}

export function readDelegationSession(address: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(storageKey(address));
    return v && /^[a-f0-9]{64}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearDelegationSession(address: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(address));
  } catch {
    // ignore
  }
}

/** Headers that bind this browser to its proven delegation. */
export function delegationSessionHeaders(
  address: string,
): Record<string, string> {
  const secret = readDelegationSession(address);
  return secret ? { [DELEGATION_SESSION_HEADER]: secret } : {};
}
