"use client";

import { DELEGATION_SESSION_HEADER } from "./delegation-session-header";

const storageKey = (address: string) =>
  `et-delegation-session:${address.toLowerCase()}`;

const SECRET_RE = /^[a-f0-9]{64}$/i;
/** Server delegations last 24h; used only when the response omits expiresAt. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** Stop reusing a session a little before the server would reject it. */
const EXPIRY_MARGIN_MS = 60 * 1000;

function parseExpiry(expiresAt: unknown): number | null {
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    return expiresAt;
  }
  if (typeof expiresAt === "string") {
    const t = Date.parse(expiresAt);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Persist the one-time session secret returned by create-delegation, with the
 * delegation's expiry so an expired session is never offered as proof.
 */
export function storeDelegationSession(
  address: string,
  secret: string | null | undefined,
  expiresAt?: string | number | null,
): void {
  if (typeof window === "undefined") return;
  if (!address || !secret || !SECRET_RE.test(secret)) return;
  const exp = parseExpiry(expiresAt) ?? Date.now() + DEFAULT_TTL_MS;
  try {
    sessionStorage.setItem(
      storageKey(address),
      JSON.stringify({ s: secret.toLowerCase(), exp }),
    );
  } catch {
    // Private mode / quota — spend will fall back to a fresh signature.
  }
}

/**
 * The stored session secret, or null when none is stored, it is malformed,
 * or its delegation has expired (or is about to). Values stored before the
 * expiry was recorded are treated as expired, so the caller signs once.
 */
export function readDelegationSession(address: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(address));
    if (!raw) return null;
    const v = JSON.parse(raw) as { s?: unknown; exp?: unknown };
    if (typeof v?.s !== "string" || !SECRET_RE.test(v.s)) return null;
    if (typeof v.exp !== "number" || v.exp - EXPIRY_MARGIN_MS <= Date.now()) {
      sessionStorage.removeItem(storageKey(address));
      return null;
    }
    return v.s;
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
