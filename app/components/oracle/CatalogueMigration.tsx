"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import { isV3Contracts } from "@/lib/contract-generation";
import { migratedAs } from "@/lib/migration-status";

/**
 * Re-publish an artist's existing masters into the v3 registry.
 *
 * ## Why this exists
 *
 * The v3 `LicenseRegistry` starts empty. Every existing track lives in the V2 NFT, and nothing
 * carries across — repointing the app without moving the catalogue first shows an empty library.
 *
 * It cannot be done for the artist. `LicenseRegistry.mintMaster` is controller-only and the
 * controller (`SalesController`) requires either the artist as `msg.sender` or their EIP-712
 * signature. That is the point of v3: the platform cannot mint in someone's name. So the artist
 * has to press the button, and this is the button.
 *
 * ## Why it is a UI rather than a script
 *
 * The artist wallet here is a Warpcast-managed verified address. It is reachable through the
 * Farcaster SDK — which is what `useWalletContext.sendTransaction` uses inside a mini app — but
 * has no browser-extension connector, so an explorer's "Write Contract" tab cannot reach it and
 * there is no private key to hand a script.
 *
 * Uses `mintMaster` (artist is `msg.sender`) rather than `mintMasterFor`, so no signature relay
 * is involved: the artist simply sends the transaction and pays their own gas.
 */

const V2_ABI = parseAbi([
  "function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)",
]);

const V3_ABI = parseAbi([
  "function totalMasters() view returns (uint256)",
  "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
  "function tokenURI(uint256) view returns (string)",
]);

const MINT_MASTER_ABI = parseAbi([
  "function mintMaster(uint256 artistFid, string uri, uint32 maxCollectorEditions, address referrer, uint96 royaltyBps, uint8 nftType, uint256 price, uint256 collectorPrice) returns (uint256)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** How far to scan V2 for masters. Ids start at 1 and the catalogue is small. */
const V2_SCAN_LIMIT = 40;

interface LegacyMaster {
  id: number;
  artistFid: bigint;
  uri: string;
  maxCollectorEditions: number;
  royaltyBps: number;
  nftType: number;
  price: bigint;
  collectorPrice: bigint;
  /** Set once we find the same tokenURI already present in v3. */
  migratedAs?: number;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "sending"; id: number }
  | { kind: "error"; message: string };

interface Props {
  walletAddress: string;
  isDarkMode?: boolean;
}

export const CatalogueMigration: React.FC<Props> = ({
  walletAddress,
  isDarkMode = true,
}) => {
  const { sendTransaction, isConnected } = useWalletContext();
  const [masters, setMasters] = useState<LegacyMaster[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [done, setDone] = useState<Record<number, string>>({});

  const v2Address = process.env.NEXT_PUBLIC_LEGACY_NFT_CONTRACT as
    | `0x${string}`
    | undefined;
  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as
    | `0x${string}`
    | undefined;
  const sales = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | `0x${string}`
    | undefined;

  const load = useCallback(async () => {
    if (!walletAddress || !v2Address || !registry) return;
    setStatus({ kind: "loading" });

    try {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      });

      // What is already in v3, keyed by tokenURI — the only field that survives both contracts
      // unchanged, so it is what tells us a track has already been re-published.
      //
      // The artist ADDRESS is deliberately NOT the filter here. It was, and that made this card
      // offer to migrate five tracks that had already been migrated: the v3 re-publish was run
      // from the deployer key, so `getMaster().artist` is the deployer while the connected wallet
      // is the artist. Nothing matched, everything looked pending, and re-running it would have
      // minted a second copy of every track.
      //
      // Matching is on the fid the contract stores as well as the address, and the fid comparison
      // happens against each legacy row's own fid below — so a track counts as migrated if the v3
      // copy belongs to this wallet OR carries the same fid the legacy row does.
      const alreadyThere = new Map<
        string,
        { id: number; artist: string; fid: bigint }
      >();
      const total = Number(
        await client.readContract({
          address: registry,
          abi: V3_ABI,
          functionName: "totalMasters",
        }),
      );
      for (let id = 1; id <= total; id++) {
        try {
          // Multiple named return values decode as a TUPLE, not an object — `artist` is [0].
          const m = (await client.readContract({
            address: registry,
            abi: V3_ABI,
            functionName: "getMaster",
            args: [BigInt(id)],
          })) as readonly unknown[];
          const owner = m[0] as string;
          const fid = (m[1] ?? 0n) as bigint;
          if (!owner) continue;
          const uri = (await client.readContract({
            address: registry,
            abi: V3_ABI,
            functionName: "tokenURI",
            args: [BigInt(id)],
          })) as string;
          if (uri) alreadyThere.set(uri, { id, artist: owner, fid });
        } catch {
          // A purged or missing id — skip it rather than abandoning the scan.
        }
      }

      const found: LegacyMaster[] = [];
      for (let id = 1; id <= V2_SCAN_LIMIT; id++) {
        try {
          const r = (await client.readContract({
            address: v2Address,
            abi: V2_ABI,
            functionName: "masterTokens",
            args: [BigInt(id)],
          })) as readonly unknown[];

          const artist = r[1] as string;
          if (!artist || artist === ZERO) continue;
          if (artist.toLowerCase() !== walletAddress.toLowerCase()) continue;

          const uri = r[2] as string;
          found.push({
            id,
            artistFid: r[0] as bigint,
            uri,
            maxCollectorEditions: Number(r[8]),
            royaltyBps: Number(r[12]),
            nftType: Number(r[11]),
            price: r[4] as bigint,
            collectorPrice: r[5] as bigint,
            // Already in v3 if the copy at this URI is owned by this wallet, or carries the same
            // fid this legacy row does. Either is proof it has been re-published.
            migratedAs: migratedAs(
              alreadyThere.get(uri),
              { fid: r[0] as bigint },
              walletAddress,
            ),
          });
        } catch {
          // Past the end of the catalogue.
        }
      }

      setMasters(found);
      setStatus({ kind: "idle" });
    } catch (e: any) {
      setStatus({
        kind: "error",
        message: e?.message ?? "Could not read your catalogue",
      });
    }
  }, [walletAddress, v2Address, registry]);

  useEffect(() => {
    void load();
  }, [load]);

  const republish = async (m: LegacyMaster) => {
    if (!sales) {
      setStatus({
        kind: "error",
        message: "Sales controller is not configured.",
      });
      return;
    }
    setStatus({ kind: "sending", id: m.id });
    try {
      const data = encodeFunctionData({
        abi: MINT_MASTER_ABI,
        functionName: "mintMaster",
        args: [
          m.artistFid,
          m.uri,
          m.maxCollectorEditions,
          ZERO,
          BigInt(m.royaltyBps),
          m.nftType,
          m.price,
          m.collectorPrice,
        ],
      });

      const res = await sendTransaction({ to: sales, data, value: "0x0" });
      const hash = res?.transactionHash ?? res?.hash ?? "";
      setDone((d) => ({ ...d, [m.id]: hash }));
      setStatus({ kind: "idle" });

      // Re-read so the row flips to "already in v3" from chain state, not from optimism.
      setTimeout(() => void load(), 4000);
    } catch (e: any) {
      setStatus({
        kind: "error",
        message: e?.shortMessage ?? e?.message ?? "Transaction failed",
      });
    }
  };

  if (!isV3Contracts()) return null;
  if (!v2Address) {
    return (
      <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
        <p className="text-xs text-yellow-300">
          Set <code>NEXT_PUBLIC_LEGACY_NFT_CONTRACT</code> to the old NFT
          address to migrate your catalogue.
        </p>
      </div>
    );
  }

  const pending = masters.filter((m) => !m.migratedAs);

  // Nothing to move: hide, which is what the call site already says this does. Showing a
  // migration card to somebody whose catalogue is fully migrated is how the wrong impression
  // started — that the migration had not happened, when it had, under a different key.
  //
  // Gated on `status.kind !== "loading"` so it does not flash away mid-read, and on there being
  // legacy tracks at all: a wallet with none has nothing to be told about either.
  if (status.kind !== "loading" && pending.length === 0) return null;
  const card = isDarkMode
    ? "bg-gray-800/50 border-gray-700"
    : "bg-gray-50 border-gray-200";
  const muted = isDarkMode ? "text-gray-400" : "text-gray-600";

  return (
    <div className={`p-4 rounded-xl border ${card} space-y-3`}>
      <div>
        <h3
          className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          Move your catalogue to the new contracts
        </h3>
        <p className={`text-xs mt-1 ${muted}`}>
          Your tracks live on the old contract and don&apos;t carry over
          automatically. Only you can re-publish them — the platform can&apos;t
          mint in your name. Each one is a transaction from your wallet; the
          metadata, price and royalty stay exactly as they are.
        </p>
      </div>

      {status.kind === "loading" && (
        <p className={`text-xs ${muted}`}>Reading your catalogue…</p>
      )}

      {status.kind === "error" && (
        <p className="text-xs text-red-400">{status.message}</p>
      )}

      {status.kind !== "loading" && masters.length === 0 && (
        <p className={`text-xs ${muted}`}>
          No tracks found on the old contract for this wallet.
        </p>
      )}

      {masters.map((m) => {
        const migrated = Boolean(m.migratedAs);
        const sending = status.kind === "sending" && status.id === m.id;
        return (
          <div
            key={m.id}
            className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
              migrated
                ? "border-green-500/30 bg-green-500/5"
                : "border-gray-600/40"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-xs font-mono truncate ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
              >
                #{m.id} · {m.uri.replace("ipfs://", "").slice(0, 18)}…
              </p>
              <p className={`text-[11px] ${muted}`}>
                {(Number(m.price) / 1e18).toLocaleString()} WMON
                {m.maxCollectorEditions > 0 &&
                  ` · ${m.maxCollectorEditions} collector editions`}
              </p>
              {done[m.id] && (
                <p className="text-[11px] text-green-400 font-mono truncate">
                  {done[m.id].slice(0, 14)}…
                </p>
              )}
            </div>

            {migrated ? (
              <span className="text-[11px] text-green-400 whitespace-nowrap">
                in v3 as #{m.migratedAs}
              </span>
            ) : (
              <button
                onClick={() => void republish(m)}
                disabled={sending || !isConnected}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {sending ? "Confirm in wallet…" : "Re-publish"}
              </button>
            )}
          </div>
        );
      })}

      {masters.length > 0 && (
        <p className={`text-[11px] ${muted}`}>
          {pending.length === 0
            ? "All tracks are on the new contracts."
            : `${pending.length} of ${masters.length} still to move. Do them in order so the numbering matches.`}
        </p>
      )}
    </div>
  );
};

export default CatalogueMigration;
