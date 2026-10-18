"use client";

/**
 * Sign in with an EmpowerTours passkey (Mera), or fall back to any other wallet.
 *
 * Browser only. Inside Farcaster the host's own wallet is used and this dialog is never opened:
 * Farcaster webviews do not reliably expose WebAuthn PRF, and the user is already signed in.
 *
 * Two explicit buttons, like hunt: "Create my wallet" and "I already have a wallet". They are
 * separate on purpose: silently creating a passkey when an open fails would hand a returning
 * person a second, empty wallet. Both go through the ordinary wagmi connector
 * (`lib/passkey/connector.ts`), so once connected the passkey address is just `useAccount()`:
 * the same message signatures, the same `authorizeUserAddress`, the same per-user Safe and
 * delegation session as MetaMask. Nothing downstream knows or cares which wallet signed.
 *
 * Opened from anywhere with `openSignIn()`. The dialog is mounted once, inside RainbowKit, so
 * "Use another wallet" can hand over to RainbowKit's own modal.
 */

import { useCallback, useEffect, useState } from "react";
import { useConnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { KeyRound, Wallet, X } from "lucide-react";
import {
  PASSKEY_CONNECTOR_ID,
  type PasskeyConnectIntent,
} from "@/lib/passkey/connector";
import { configuredPasskeyRpId, hostCanUseRpId } from "@/lib/passkey/rp-id";

const OPEN_EVENT = "empowertours:open-sign-in";
let mounted = false;

/**
 * Open the sign-in dialog. Returns false when it is not mounted (e.g. inside a host that does
 * not render StandaloneProviders), so the caller can fall back to RainbowKit's modal.
 */
export function openSignIn(): boolean {
  if (typeof window === "undefined" || !mounted) return false;
  window.dispatchEvent(new Event(OPEN_EVENT));
  return true;
}

type Lang = "en" | "es";

const COPY = {
  en: {
    title: "Sign in to EmpowerTours",
    intro:
      "One passkey, one wallet, across EmpowerTours: art, Rumbo and Hunt. No seed phrase to type, no extension.",
    create: "Create my wallet",
    open: "I already have a wallet",
    other: "Use another wallet",
    otherHint: "MetaMask, Rainbow, Coinbase, WalletConnect…",
    waiting: "Waiting for your passkey…",
    another: "Choose a different passkey",
    backup: "Write down your recovery phrase any time at /wallet/backup.",
    cancelled: "Cancelled at the passkey prompt.",
    noPrf:
      "This browser or device can’t make a wallet from a passkey (it lacks WebAuthn PRF). Try Safari on iPhone or Chrome on Android/desktop, or use another wallet.",
    notHere: (rpId: string) =>
      `Passkey wallets work on ${rpId}. Open https://art.${rpId} to use yours, or use another wallet here.`,
    unsupported:
      "Passkeys aren’t available in this browser. Use another wallet, or open the app in Safari or Chrome.",
    failed: "Couldn’t open your passkey. Try again on the device that holds it.",
    lang: "Español",
  },
  es: {
    title: "Entra a EmpowerTours",
    intro:
      "Una passkey, una billetera, en todo EmpowerTours: art, Rumbo y Hunt. Sin frase semilla que teclear, sin extensiones.",
    create: "Crear mi billetera",
    open: "Ya tengo una billetera",
    other: "Usar otra billetera",
    otherHint: "MetaMask, Rainbow, Coinbase, WalletConnect…",
    waiting: "Esperando tu passkey…",
    another: "Elegir otra passkey",
    backup: "Anota tu frase de recuperación cuando quieras en /wallet/backup.",
    cancelled: "Cancelaste el aviso de la passkey.",
    noPrf:
      "Este navegador o dispositivo no puede crear una billetera desde una passkey (no tiene WebAuthn PRF). Prueba Safari en iPhone o Chrome en Android/escritorio, o usa otra billetera.",
    notHere: (rpId: string) =>
      `Las billeteras con passkey funcionan en ${rpId}. Abre https://art.${rpId} para usar la tuya, o usa otra billetera aquí.`,
    unsupported:
      "Las passkeys no están disponibles en este navegador. Usa otra billetera, o abre la app en Safari o Chrome.",
    failed: "No se pudo abrir tu passkey. Inténtalo de nuevo en el dispositivo que la tiene.",
    lang: "English",
  },
} as const;

type Support = "checking" | "ok" | "no-webauthn" | "no-prf" | "wrong-host";

/** Best-effort capability check. "ok" can still fail at the prompt; that is reported then. */
async function detectSupport(): Promise<{ support: Support; rpId: string }> {
  let rpId = "empowertours.xyz";
  try {
    rpId = configuredPasskeyRpId();
  } catch {
    return { support: "wrong-host", rpId };
  }
  if (!hostCanUseRpId(location.hostname, rpId)) return { support: "wrong-host", rpId };
  const PKC = (window as { PublicKeyCredential?: unknown }).PublicKeyCredential as
    | { getClientCapabilities?: () => Promise<Record<string, boolean>> }
    | undefined;
  if (!PKC || !window.isSecureContext) return { support: "no-webauthn", rpId };
  try {
    const caps = await PKC.getClientCapabilities?.();
    // Only an explicit `false` is believed. Absent means "unknown", and several browsers that do
    // support PRF do not report it yet.
    if (caps && caps["extension:prf"] === false) return { support: "no-prf", rpId };
  } catch {
    // Unknown: let the ceremony answer.
  }
  return { support: "ok", rpId };
}

function errorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export default function PasskeySignInDialog() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [support, setSupport] = useState<Support>("checking");
  const [rpId, setRpId] = useState("empowertours.xyz");
  const [busy, setBusy] = useState<PasskeyConnectIntent["mode"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerAnother, setOfferAnother] = useState(false);
  const { connectAsync, connectors } = useConnect();
  const { openConnectModal } = useConnectModal();
  const t = COPY[lang];

  useEffect(() => {
    mounted = true;
    const onOpen = () => {
      setError(null);
      setOfferAnother(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    if (navigator.language?.toLowerCase().startsWith("es")) setLang("es");
    return () => {
      mounted = false;
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || support !== "checking") return;
    void detectSupport().then((r) => {
      setSupport(r.support);
      setRpId(r.rpId);
    });
  }, [open, support]);

  const run = useCallback(
    async (intent: PasskeyConnectIntent) => {
      const connector = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID);
      if (!connector) {
        setError(t.unsupported);
        return;
      }
      setBusy(intent.mode);
      setError(null);
      setOfferAnother(false);
      try {
        // wagmi passes every parameter except `connector` through to the connector's connect().
        await connectAsync({ connector, passkey: intent } as never);
        setOpen(false);
      } catch (e) {
        const code = errorCode(e);
        const name = (e as { name?: string })?.name;
        if (code === "PRF_UNAVAILABLE") {
          setSupport("no-prf");
        } else if (name === "PasskeyHostError") {
          setSupport("wrong-host");
        } else if (code === "PASSKEY_OPERATION_FAILED" || name === "NotAllowedError") {
          setError(intent.mode === "open" ? t.failed : t.cancelled);
          if (intent.mode === "open") setOfferAnother(true);
        } else {
          setError(e instanceof Error ? e.message : t.failed);
        }
      } finally {
        setBusy(null);
      }
    },
    [connectors, connectAsync, t],
  );

  const chooseOtherWallet = useCallback(() => {
    setOpen(false);
    openConnectModal?.();
  }, [openConnectModal]);

  if (!open) return null;

  const passkeyBlocked =
    support === "no-prf" || support === "no-webauthn" || support === "wrong-host";
  const blockedNote =
    support === "no-prf"
      ? t.noPrf
      : support === "wrong-host"
        ? t.notHere(rpId)
        : support === "no-webauthn"
          ? t.unsupported
          : null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="et-signin-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) setOpen(false);
      }}
    >
      <div className="w-full max-w-sm border border-rule bg-ink-raised p-5 text-paper shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="et-signin-title" className="text-lg font-semibold">
            {t.title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={!!busy}
            onClick={() => setOpen(false)}
            className="opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm opacity-80">{t.intro}</p>

        {blockedNote ? (
          <p className="mb-4 border border-rule p-3 text-xs opacity-90">{blockedNote}</p>
        ) : (
          <div className="mb-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!!busy || support === "checking"}
              onClick={() => void run({ mode: "create", label: "EmpowerTours wallet" })}
              className="flex items-center justify-center gap-2 bg-foil px-4 py-2.5 text-sm font-semibold text-ink hover:bg-foil-bright disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {busy === "create" ? t.waiting : t.create}
            </button>
            <button
              type="button"
              disabled={!!busy || support === "checking"}
              onClick={() => void run({ mode: "open" })}
              className="flex items-center justify-center gap-2 border border-rule px-4 py-2.5 text-sm font-semibold hover:border-foil-dim disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {busy === "open" ? t.waiting : t.open}
            </button>
            {offerAnother && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run({ mode: "open", useHint: false })}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                {t.another}
              </button>
            )}
            <p className="text-[11px] opacity-60">{t.backup}</p>
          </div>
        )}

        {error && !passkeyBlocked && (
          <p role="alert" className="mb-3 text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!!busy}
          onClick={chooseOtherWallet}
          className="flex w-full items-center justify-center gap-2 border border-rule px-4 py-2.5 text-sm hover:border-foil-dim disabled:opacity-50"
        >
          <Wallet className="h-4 w-4" />
          <span>{t.other}</span>
        </button>
        <p className="mt-1 text-center text-[11px] opacity-60">{t.otherHint}</p>

        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "es" : "en")}
          className="mt-3 w-full text-center text-[11px] underline opacity-60 hover:opacity-100"
        >
          {t.lang}
        </button>
      </div>
    </div>
  );
}
