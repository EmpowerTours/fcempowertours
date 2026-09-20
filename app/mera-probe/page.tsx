"use client";

/**
 * Does Mera's passkey path work here? A probe, not a feature.
 *
 * Mera derives a real secp256k1 key from a passkey's WebAuthn PRF output. PRF is not universally
 * supported, and it is commonly unavailable inside an embedded webview — which is what a
 * Farcaster mini app is. That decides the whole design: if PRF works only in a normal browser,
 * Mera is the browser-path signer and Farcaster keeps its own wallet, which is the intended
 * split anyway.
 *
 * Rather than read that off a compatibility table, this page answers it on the actual device,
 * at the actual origin, in one tap. It is deliberately standalone: it touches no app state, no
 * wallet context, no contracts, and spends nothing.
 *
 * It reports the environment FIRST, before any ceremony, because "did it fail because PRF is
 * missing, or because the user dismissed the prompt" are different answers and the failure alone
 * does not distinguish them.
 */

import { useState } from "react";
import { verifyMessage } from "viem";

type Line = { label: string; value: string; ok?: boolean };

export default function MeraProbe() {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (label: string, value: string, ok?: boolean) =>
    setLines((l) => [...l, { label, value, ok }]);

  async function environment() {
    setLines([]);
    push("origin", window.location.origin);
    push(
      "secure context",
      String(window.isSecureContext),
      window.isSecureContext,
    );
    // A webview is the case we most expect to fail, so name it explicitly rather than inferring
    // it later from a confusing error.
    const inIframe = window.self !== window.top;
    push("in iframe/webview", String(inIframe), !inIframe);
    push("user agent", navigator.userAgent.slice(0, 90));

    const hasWebAuthn = typeof window.PublicKeyCredential !== "undefined";
    push("WebAuthn available", String(hasWebAuthn), hasWebAuthn);
    if (!hasWebAuthn) return;

    try {
      const uvpa =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      push("platform authenticator", String(uvpa), uvpa);
    } catch (e) {
      push("platform authenticator", `check threw: ${String(e)}`, false);
    }

    // There is no feature-detect for PRF that does not involve creating a credential — the
    // extension only reports back from a real ceremony. So this is the honest answer until the
    // button below is pressed.
    push("PRF support", "unknown until a passkey is created");
  }

  async function runCeremony() {
    setBusy(true);
    try {
      const { createPasskeyWithPrfOutput, createSecp256k1SigningSession } =
        await import("@category-labs/mera");
      const { toViemAccount } = await import("@category-labs/mera/viem");
      const { HDKey } = await import("@scure/bip32");
      const { entropyToMnemonic, mnemonicToSeedSync } = await import(
        "@scure/bip39"
      );
      const { wordlist } = await import("@scure/bip39/wordlists/english.js");

      push("step", "creating passkey — approve the prompt");
      const { prfOutput } = await createPasskeyWithPrfOutput({
        // rp.id must be the registrable domain the page is served from, or the ceremony is
        // rejected. Derived rather than hardcoded so this probe is honest on any host.
        rp: { id: window.location.hostname, name: "EmpowerTours" },
        user: { name: "mera-probe", displayName: "Mera probe" },
      });
      push("PRF output", `${prfOutput.length} bytes`, prfOutput.length === 32);

      const mnemonic = entropyToMnemonic(prfOutput, wordlist);
      const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(
        "m/44'/60'/0'/0/0",
      );
      if (!node.privateKey) throw new Error("derivation produced no key");

      const session = createSecp256k1SigningSession({
        privateKey: node.privateKey,
      });
      const account = toViemAccount(session);
      push("address", account.address, true);

      // Sign and RECOVER. A signature that comes back is not evidence it is valid; recovering it
      // to the same address is.
      const message = `mera probe ${new Date().toISOString()}`;
      const signature = await account.signMessage({ message });
      const recovered = await verifyMessage({
        address: account.address,
        message,
        signature,
      });
      push("sign + recover", String(recovered), recovered);

      session.end();
      push("session ended", "key zeroed", true);
      push(
        "verdict",
        recovered
          ? "PRF works here — Mera is usable on this device/browser"
          : "signature did not recover; do not build on this",
        recovered,
      );
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      push("FAILED", msg, false);
      push(
        "verdict",
        /NotSupported|prf|PRF/.test(msg)
          ? "PRF unsupported here — expected inside a webview; try a normal browser"
          : "ceremony failed for another reason — read the message above",
        false,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "ui-monospace, monospace",
        maxWidth: 760,
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Mera passkey probe</h1>
      <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
        Creates a passkey, derives an address, signs and recovers. Touches no
        contracts and spends nothing.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button onClick={environment} style={btn}>
          1. Check environment
        </button>
        <button onClick={runCeremony} disabled={busy} style={btn}>
          {busy ? "running…" : "2. Create passkey + sign"}
        </button>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {lines.map((l, i) => (
          <div key={i}>
            <span style={{ opacity: 0.6 }}>{l.label.padEnd(24, " ")}</span>
            <span
              style={{
                color:
                  l.ok === undefined ? "inherit" : l.ok ? "#15803d" : "#b91c1c",
                wordBreak: "break-all",
              }}
            >
              {l.value}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid currentColor",
  borderRadius: 6,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
};
