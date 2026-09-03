"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import { isV3Contracts } from "@/lib/contract-generation";
import { ProfileAvatar } from "@/app/components/oracle/ProfileAvatar";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";
import { useSignMessage } from "wagmi";
import {
  MAX_NAME_BYTES,
  byteLength,
  validateDisplayName,
} from "@/lib/profile-name";

/**
 * Claim a display name in `ProfileRegistry`.
 *
 * ## Why this exists
 *
 * `ProfileRegistry` was deployed on 2026-08-21 so that an artist with no Farcaster account has
 * something to be called. Nothing read it and nothing wrote to it, so every wallet-only artist
 * rendered as a bare address — the fallback, permanently, because there was no way to reach the
 * step above it.
 *
 * ## What a name here is, and is not
 *
 * It is first-come and self-registered. It is **not** a Farcaster username and must never be
 * shown as one: the registry's own comment warns that homoglyphs are registerable, so
 * `Earvin Gallardo` and a Cyrillic lookalike are different keys holding the same-looking name.
 * That is why `resolveArtistName` marks a registry name `needsAddressShown` and why this form
 * says so rather than leaving the user to assume it is verified.
 *
 * ## Rules, from the contract
 *
 *   - 32 bytes, not characters. An emoji costs four.
 *   - No leading or trailing space; interior spaces are fine, so "Earvin Gallardo" is valid.
 *   - No control characters.
 *   - Unique, case-folded: `Unify34` and `unify34` cannot both be claimed.
 *   - Renaming frees the old name in the same transaction.
 *
 * The transaction is sent by the artist's own wallet. `setProfile` is ungated, so the platform
 * is not involved in who gets to be called what.
 */

const PROFILE_ABI = parseAbi([
  "function displayNameOf(address owner) view returns (string)",
  "function ownerOfName(string displayName) view returns (address)",
  "function getProfile(address owner) view returns ((string displayName, string avatarURI, string bio, uint64 updatedAt))",
  "function setProfile(string displayName, string avatarURI, string bio) external",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

/** "12 days", "6 hours", "40 minutes" — never "0 days". */
function formatWait(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

interface Props {
  walletAddress: string | null | undefined;
  isDarkMode: boolean;
  /**
   * The viewer's Farcaster username, when they have one.
   *
   * This form was rendered unconditionally, so a Farcaster user was invited to claim a name that
   * `resolveArtistName` would never show them — the address tier wins, and reaching the registry
   * tier at all means the address lookup found nothing. Offering a control that cannot change
   * what the user sees is worse than not offering it.
   */
  farcasterUsername?: string | null;
}

export function DisplayNameSetting({
  walletAddress,
  isDarkMode,
  farcasterUsername,
}: Props) {
  const { sendTransaction, isConnected, switchChain } = useWalletContext();
  const { signMessageAsync } = useSignMessage();

  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Held so a name change writes them back. setProfile overwrites all three
  // fields, and this control used to pass empty strings for the other two --
  // harmless only while nobody had an avatar.
  const [avatarUri, setAvatarUri] = useState("");
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  // Seconds until this address may change its picture again, from the server.
  const [cooldown, setCooldown] = useState<number | null>(null);

  const registry = process.env.NEXT_PUBLIC_PROFILE_REGISTRY as
    | `0x${string}`
    | undefined;

  const client = useCallback(
    () => createPublicClient({ chain: activeChain, transport: http() }),
    [],
  );

  const load = useCallback(async () => {
    if (!walletAddress || !registry) return;
    setLoading(true);
    try {
      // getProfile, not displayNameOf: the other two fields have to be read
      // before they can be preserved on write.
      const profile = (await client().readContract({
        address: registry,
        abi: PROFILE_ABI,
        functionName: "getProfile",
        args: [walletAddress as `0x${string}`],
      })) as {
        displayName: string;
        avatarURI: string;
        bio: string;
        updatedAt: bigint;
      };
      const name = profile?.displayName ?? "";
      setCurrent(name || null);
      setDraft(name || "");
      setAvatarUri(profile?.avatarURI ?? "");
      setBio(profile?.bio ?? "");

      // Ask the server, not the chain. `updatedAt` moves on any profile write,
      // so using it would make a name change look like a picture change and
      // lock someone out of a limit they never spent.
      try {
        const res = await fetch(
          `/api/profile/avatar?address=${encodeURIComponent(walletAddress)}`,
        );
        const data = await res.json();
        setCooldown(data?.canChange ? 0 : (data?.secondsRemaining ?? 0));
      } catch {
        setCooldown(null);
      }
    } catch {
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, registry, client]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError(null);
    setStatus(null);

    const name = draft.trim();
    const localError = validateDisplayName(name);
    if (localError) {
      setError(localError);
      return;
    }
    if (!registry) {
      setError("NEXT_PUBLIC_PROFILE_REGISTRY is not set.");
      return;
    }
    if (name === current) {
      setError("That is already your name.");
      return;
    }

    setSaving(true);
    try {
      // Check availability first. The contract reverts NameTaken, but a revert costs gas and
      // surfaces as an opaque failure — telling the user up front is the whole difference.
      const owner = (await client().readContract({
        address: registry,
        abi: PROFILE_ABI,
        functionName: "ownerOfName",
        args: [name],
      })) as string;

      if (
        owner !== ZERO &&
        owner.toLowerCase() !== (walletAddress ?? "").toLowerCase()
      ) {
        setError(`"${name}" is already taken.`);
        setSaving(false);
        return;
      }

      // Write back the avatar and bio that were read in load(). setProfile
      // replaces the whole struct, so passing "" here erased whatever else the
      // artist had set -- a picture vanishing when you rename yourself, looking
      // like the upload had failed.
      const data = encodeFunctionData({
        abi: PROFILE_ABI,
        functionName: "setProfile",
        args: [name, avatarUri, bio],
      });

      // chainId is REQUIRED here. Without it useFarcasterContext sends
      // eth_sendTransaction with chainId: undefined, so the Farcaster
      // wallet stays on whatever chain it is already on — Base by default
      // — and offers to sign a Monad transaction there. Confirming does
      // nothing: the contract does not exist on that chain.
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: registry,
        data,
        value: "0x0",
        chainId: activeChain.id,
      });
      setStatus(`Your artist name is now "${name}".`);
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not set the name.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Pin a picture and store its CID.
   *
   * Written as ipfs://<cid>, never a gateway URL: 256 bytes is the on-chain cap
   * and a gateway hostname wastes it, but more importantly the CID keeps working
   * if the gateway changes. The app only renders IPFS content it recognises --
   * see resolveAvatarUri -- so an arbitrary URL would be stored and then ignored.
   */
  const uploadAvatar = async (file: File) => {
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      if (!current) {
        throw new Error("Set your artist name first, then add a picture.");
      }
      if (!file.type.startsWith("image/")) {
        throw new Error("That file is not an image.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Keep it under 5MB.");
      }

      const body = new FormData();
      body.append("file", file);
      body.append("address", walletAddress as string);

      // Signed nonce: a per-address limit on an unauthenticated endpoint is
      // decoration, since anyone could send a different address.
      const headers = await walletAuthHeaders({
        address: walletAddress as string,
        signMessage: signMessageAsync,
        context: "profile-avatar",
      });

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers,
        body,
      });
      const data = await res.json();
      if (res.status === 429) {
        setCooldown(data?.secondsRemaining ?? null);
        throw new Error(
          data?.error ||
            "You can change your profile picture once every 30 days.",
        );
      }
      if (!res.ok || !data?.avatarURI) {
        throw new Error(data?.error || "Could not upload the picture.");
      }

      const uri = data.avatarURI as string;
      const dataHex = encodeFunctionData({
        abi: PROFILE_ABI,
        functionName: "setProfile",
        args: [current, uri, bio],
      });
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: registry,
        data: dataHex,
        value: "0x0",
        chainId: activeChain.id,
      });
      setAvatarUri(uri);
      setCooldown(data?.cooldownSeconds ?? 30 * 24 * 60 * 60);
      setStatus("Picture updated. You can change it again in 30 days.");
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not set the picture.");
    } finally {
      setUploading(false);
    }
  };

  if (!isV3Contracts()) return null;
  if (!registry) return null;

  // On Farcaster with nothing registered: there is nothing useful to do here, because a name
  // claimed now would sit below the Farcaster handle forever. Hidden rather than disabled — a
  // greyed-out field still reads as "something you are missing out on".
  //
  // Still shown to a Farcaster user who ALREADY has a name, because otherwise there would be no
  // way to change or see it. The copy below says plainly that it is not in use.
  const onFarcaster = Boolean(farcasterUsername);
  if (onFarcaster && !loading && !current) return null;

  const card = isDarkMode
    ? "bg-gray-800/50 border-gray-700"
    : "bg-gray-50 border-gray-200";
  const muted = isDarkMode ? "text-gray-400" : "text-gray-600";
  const bytes = byteLength(draft.trim());

  return (
    <div className={`p-4 rounded-xl border ${card} space-y-3`}>
      {/* Fixed 48px, capped by width/height attributes as well as classes, so a
          large upload cannot take over the page the way Ganado's 1024px cover
          did when Tailwind was emitting nothing. */}
      <div className="flex items-center gap-3">
        <ProfileAvatar uri={avatarUri} name={current ?? draft} />
        <div className="min-w-0">
          <p className="text-xs font-bold">Profile picture</p>
          {cooldown !== null && cooldown > 0 ? (
            <p className={`text-xs ${muted}`}>
              Changed recently — you can change it again in{" "}
              {formatWait(cooldown)}.
            </p>
          ) : (
            <label
              className={`text-xs underline cursor-pointer ${
                current ? "text-cyan-500" : "text-gray-500 cursor-not-allowed"
              }`}
            >
              {uploading
                ? "Uploading…"
                : avatarUri
                  ? "Change picture"
                  : "Add a picture"}
              <input
                type="file"
                accept="image/*"
                disabled={uploading || !current}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {!current && (
            <p className={`text-[11px] ${muted}`}>
              Set a name first — the registry stores them together.
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold">Artist name</h3>
        {onFarcaster ? (
          <p className={`text-xs ${muted}`}>
            Not in use — your tracks show{" "}
            <span className="font-mono">@{farcasterUsername}</span>, which
            Farcaster verified. This registry name only appears for artists with
            no Farcaster account.
          </p>
        ) : (
          <p className={`text-xs ${muted}`}>
            Shown on your tracks when you have no Farcaster account. Anyone can
            register a name, so it is always displayed next to your address.
          </p>
        )}
      </div>

      {loading ? (
        <p className={`text-xs ${muted}`}>Loading…</p>
      ) : (
        <>
          {current && (
            <p className={`text-xs ${muted}`}>
              Currently: <span className="font-mono">{current}</span>
            </p>
          )}

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Earvin Gallardo"
            disabled={saving || !isConnected}
            className={`w-full px-3 py-2 rounded-lg text-sm border ${
              isDarkMode
                ? "bg-gray-900 border-gray-700 text-white placeholder-gray-600"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
            }`}
          />

          <p
            className={`text-[10px] ${
              bytes > MAX_NAME_BYTES ? "text-red-400" : muted
            }`}
          >
            {bytes}/{MAX_NAME_BYTES} bytes · spaces allowed inside the name ·
            renaming frees your old name
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {status && <p className="text-xs text-green-400">{status}</p>}

          <button
            onClick={save}
            disabled={saving || !isConnected || draft.trim().length === 0}
            className="w-full py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-colors"
          >
            {saving
              ? "Confirming…"
              : !isConnected
                ? "Connect a wallet"
                : current
                  ? "Change name"
                  : "Claim name"}
          </button>
        </>
      )}
    </div>
  );
}
