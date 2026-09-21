"use client";

/**
 * Show the recovery phrase, once, on purpose.
 *
 * ## Why this exists
 *
 * The wallet is derived, not stored: PRF bytes -> BIP-39 -> m/44'/60'/0'/0/0. That makes it
 * reproducible from the passkey forever, and completely unreachable without it. For a wallet
 * that will own masters and receive sale proceeds, "your authenticator is the only copy" is not
 * an acceptable position — and `lib/passkey/derive.ts` says why the phrase is a standard BIP-39
 * one in the first place: an artist must be able to walk away with their work. Nobody can walk
 * away from something they are never allowed to see.
 *
 * The phrase is not a new secret. It is `entropyToMnemonic(prfOutput)` and anyone holding the
 * passkey can compute it. What this page adds is DISPLAY, and display is the whole risk.
 *
 * ## The rules this page follows
 *
 * - A fresh passkey ceremony every time. Not a cached session, not a cookie: a live session or a
 *   stolen cookie must not be enough to read the phrase, so an unattended open tab leaks nothing.
 * - Derived, shown, discarded. One state variable, cleared on hide and on unmount. Never
 *   localStorage, sessionStorage, IndexedDB, a cookie, the URL, or the server.
 * - Never logged. Not to console, not into an error message, not to analytics. An error here
 *   reports that it failed, never what it was working on.
 * - NO COPY BUTTON for the phrase. On several platforms the clipboard is readable by other
 *   applications and survives long after the paste. The address gets one — it is public and
 *   copying it is the normal thing to do — and the phrase does not.
 *
 * What it cannot do is stop a screenshot or a screen recording, so it says so rather than
 * implying a safety it does not provide.
 */

import { useCallback, useEffect, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";

export default function WalletBackup() {
  const [words, setWords] = useState<string[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Anything derived here dies with the component. */
  useEffect(() => {
    return () => {
      setWords(null);
      setAddress(null);
    };
  }, []);

  const reveal = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // A fresh ceremony, deliberately. The user proves possession of the authenticator now,
      // not at some point earlier in the session.
      const { openWallet } = await import("@/lib/passkey/ceremony");
      const wallet = await openWallet();
      setWords(wallet.mnemonic.split(" "));
      setAddress(privateKeyToAccount(toHex(wallet.privateKey)).address);
    } catch (e) {
      // Deliberately does not include the caught value: an authenticator error is safe, but this
      // is the one code path in the app where a thrown object could carry key material, and a
      // log line is forever.
      setError(
        e instanceof Error && /NotAllowed|abort/i.test(e.name + e.message)
          ? "Cancelled at the passkey prompt."
          : "Could not read the passkey. Try again on the device that holds it.",
      );
      setBusy(false);
      return;
    }
    setBusy(false);
  }, []);

  const hide = useCallback(() => {
    setWords(null);
    setAddress(null);
    setCopied(false);
  }, []);

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Recovery phrase</h1>
      <p style={muted}>
        These 24 words are your wallet. Anyone who has them controls this
        address — its music, its licences, and any unclaimed sale proceeds —
        permanently, and it cannot be undone or revoked.
      </p>
      <p style={muted}>
        Write them on paper. Do not photograph them, and do not put them in
        notes, email or a chat. This page cannot prevent a screenshot or a
        screen recording.
      </p>

      {!words && (
        <button onClick={reveal} disabled={busy} style={btn}>
          {busy ? "waiting for your passkey…" : "Show my recovery phrase"}
        </button>
      )}

      {error && <p style={{ ...muted, color: "#b91c1c" }}>{error}</p>}

      {words && (
        <>
          <ol style={grid}>
            {words.map((w, i) => (
              <li key={i} style={cell}>
                <span style={{ opacity: 0.45, marginRight: 8 }}>{i + 1}</span>
                {w}
              </li>
            ))}
          </ol>

          {address && (
            <div style={{ marginTop: 18, fontSize: 13 }}>
              <div style={{ opacity: 0.6, marginBottom: 4 }}>
                Wallet address — public, safe to share
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ wordBreak: "break-all" }}>{address}</code>
                <button
                  onClick={() => {
                    // The address only. Copying it is the normal thing to do with an address,
                    // and it gives away nothing — it is already on chain.
                    navigator.clipboard?.writeText(address).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                  style={{ ...btn, padding: "4px 10px", fontSize: 12 }}
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            </div>
          )}

          <button onClick={hide} style={{ ...btn, marginTop: 18 }}>
            Hide
          </button>
          <p style={{ ...muted, marginTop: 10 }}>
            Nothing here was saved. Closing this page discards it, and you can
            come back and ask your passkey again whenever you like.
          </p>
        </>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  padding: 24,
  maxWidth: 620,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  lineHeight: 1.5,
};
const muted: React.CSSProperties = { fontSize: 13, opacity: 0.75 };
const btn: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid currentColor",
  borderRadius: 6,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 6,
  listStyle: "none",
  padding: 0,
  margin: "18px 0 0",
  fontFamily: "ui-monospace, monospace",
  fontSize: 14,
};
const cell: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.35)",
  borderRadius: 4,
  padding: "6px 10px",
};
