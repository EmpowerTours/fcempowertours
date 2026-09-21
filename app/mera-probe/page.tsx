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
    push("in iframe", String(inIframe), !inIframe);

    // An in-app browser is NOT an iframe — it is top-level, so the check above cannot see it.
    // Labelling that check "webview" claimed a detection it never performed, and on a real
    // iPhone it reported a clean environment for a browser that could not create a passkey.
    //
    // iOS tells them apart by UA tail: standalone Safari carries "Version/… Safari/…", while a
    // WKWebView embedded in another app stops at "Mobile/…". This is a heuristic, so it is
    // reported as a suspicion rather than a verdict.
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    // Chrome, Firefox and Edge on iOS are REAL browsers that carry no "Version/" token — they
    // use CriOS/FxiOS/EdgiOS instead. A first version tested only for "Version/… Safari/…" and
    // so flagged Chrome on iOS as an in-app browser, on a run where everything worked. A check
    // that cries wolf on a working setup is worse than no check.
    const namedBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const looksInApp =
      isIOS && !namedBrowser && !/Version\/[\d.]+.*Safari\//.test(ua);
    push(
      "in-app browser (iOS)",
      looksInApp ? "likely — open in Safari instead" : "no",
      !looksInApp,
    );
    // Full, not truncated: the tail is exactly the part that distinguishes them, and slicing it
    // to 90 characters cut off the evidence.
    push("user agent", ua);

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
    push("PRF support", "unknown until the passkey answers");
  }

  async function runCeremony() {
    setBusy(true);
    try {
      const { getPasskeyPrfOutput, createSecp256k1SigningSession } =
        await import("@category-labs/mera");
      const { toViemAccount } = await import("@category-labs/mera/viem");
      const { HDKey } = await import("@scure/bip32");
      const { entropyToMnemonic, mnemonicToSeedSync } = await import(
        "@scure/bip39"
      );
      const { wordlist } = await import("@scure/bip39/wordlists/english.js");

      push("step", "choose your existing passkey at the prompt");
      // ---- OPENS the existing wallet. It does not create one, and that matters.
      //
      // This probe first called createPasskeyWithPrfOutput against window.location.hostname,
      // which was merely useless: a credential for art.empowertours.xyz derives a different
      // address from the ecosystem's empowertours.xyz, so it tested a wallet nobody would use.
      //
      // Pointing it at the real rp id made it dangerous instead. There is already a Mera wallet
      // on this rp id — the one hunt and cota derive — and creating there mints a SECOND
      // credential for the same face, silently, with a different address and no error. The
      // useful question was never "can this device make a passkey"; it is "does this device
      // reproduce MY wallet".
      const { EMPOWERTOURS_RP_ID, EMPOWERTOURS_PRF_SALT } = await import(
        "@/lib/passkey/derive"
      );
      const { prfOutput } = await getPasskeyPrfOutput({
        rpId: EMPOWERTOURS_RP_ID,
        prfSalt: EMPOWERTOURS_PRF_SALT,
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
          ? "PRF works here. If the address above is your hunt wallet, this device reproduces it."
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
          : "creation failed. If 'platform authenticator' is false above, this browser cannot " +
            "make a passkey at all — open the page in Safari (not an in-app browser) and " +
            "check Settings > Passwords is on.",
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
        Opens your existing EmpowerTours passkey, derives the address, signs and
        recovers. Creates nothing, touches no contracts, spends nothing.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button onClick={environment} style={btn}>
          1. Check environment
        </button>
        <button onClick={runCeremony} disabled={busy} style={btn}>
          {busy ? "running…" : "2. Open my wallet + sign"}
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
