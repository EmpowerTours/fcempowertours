"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";

/**
 * An artist's controls for their own master: price, and whether it is for sale.
 *
 * Both live on SalesController and are gated on `getMaster(id).artist ==
 * msg.sender`. The artist is the WALLET that signed the mint, not their Safe, so
 * these are ordinary wallet transactions and cannot go through the gasless Safe
 * path. That is the point: it is what stops the platform repricing or delisting
 * someone's work.
 *
 * Why this exists: there was no way to change a price or take a track down
 * without burning the master, which is irreversible, cannot be re-minted under
 * the same id, and leaves any licences already sold pointing at nothing. Both
 * functions were deployed and had no interface.
 */

const SALES_ABI = parseAbi([
  "function pricing(uint256) view returns (uint256 price, uint256 collectorPrice, bool salesPaused)",
  "function setPricing(uint256 masterTokenId, uint256 price, uint256 collectorPrice) external",
  "function setSalesPaused(uint256 masterTokenId, bool paused) external",
]);

const REGISTRY_ABI = parseAbi([
  "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
  "function burn(uint256 tokenId) external",
]);

interface Props {
  tokenId: string | number;
  /** Typed back by the artist to confirm a burn. Irreversible needs friction. */
  trackName?: string;
  /** Rendered only when this matches the master's on-chain artist. */
  onChanged?: () => void;
  /** ProfileModal is dark; /profile is light. Same controls, both surfaces. */
  dark?: boolean;
}

export function TrackSalesControls({
  tokenId,
  trackName,
  onChanged,
  dark,
}: Props) {
  const { walletAddress, sendTransaction, switchChain } = useWalletContext();

  const [isArtist, setIsArtist] = useState(false);
  const [price, setPrice] = useState("");
  const [collectorPrice, setCollectorPrice] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<null | "price" | "pause" | "burn">(null);
  const [confirmingBurn, setConfirmingBurn] = useState(false);
  const [burnConfirmText, setBurnConfirmText] = useState("");
  const [collectorsMinted, setCollectorsMinted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const sales = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | `0x${string}`
    | undefined;
  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as
    | `0x${string}`
    | undefined;

  const load = useCallback(async () => {
    if (!sales || !registry || !walletAddress) return;
    try {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      });
      const [master, p] = await Promise.all([
        client.readContract({
          address: registry,
          abi: REGISTRY_ABI,
          functionName: "getMaster",
          args: [BigInt(tokenId)],
        }),
        client.readContract({
          address: sales,
          abi: SALES_ABI,
          functionName: "pricing",
          args: [BigInt(tokenId)],
        }),
      ]);
      // getMaster returns a positional tuple; artist is [0].
      const artist = (master as unknown as unknown[])[0] as string;
      setIsArtist(artist?.toLowerCase() === walletAddress.toLowerCase());
      // Position 4 is collectorsMinted. Shown before a burn because burning a
      // master orphans every licence already sold from it.
      setCollectorsMinted(Number((master as unknown as unknown[])[4] ?? 0));

      const [onchainPrice, onchainCollector, onchainPaused] = p as unknown as [
        bigint,
        bigint,
        boolean,
      ];
      setPrice(formatEther(onchainPrice));
      setCollectorPrice(formatEther(onchainCollector));
      setPaused(onchainPaused);
    } catch {
      // A failed read must not render controls that would revert.
      setIsArtist(false);
    }
  }, [sales, registry, walletAddress, tokenId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isArtist || !sales) return null;

  const savePrice = async () => {
    setBusy("price");
    setError(null);
    setStatus(null);
    try {
      // The contract rejects a zero standard price outright.
      if (!price || Number(price) <= 0) {
        throw new Error("Standard price must be greater than zero.");
      }
      const data = encodeFunctionData({
        abi: SALES_ABI,
        functionName: "setPricing",
        args: [
          BigInt(tokenId),
          parseEther(price),
          collectorPrice ? parseEther(collectorPrice) : 0n,
        ],
      });
      // chainId, always. Without it the Farcaster wallet prompts on whatever
      // chain it is already on — Base by default — and confirming does nothing.
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: sales,
        data,
        value: "0x0",
        chainId: activeChain.id,
      });
      setStatus("Price updated.");
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not update the price.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Burn the master. Irreversible, and the id can never be reused.
   *
   * The gentler option is almost always right: taking a track off sale hides it
   * and keeps every licence already sold working. Burn exists for the cases the
   * artist actually asked for — a typo in the name, or wanting the work off the
   * platform entirely — because tokenURI is fixed at mint and cannot be edited.
   *
   * Requires the artist's wallet, not their Safe: the registry checks
   * ownerOf(masterTokenId), and masters are minted to the signing wallet.
   */
  const burnMaster = async () => {
    setBusy("burn");
    setError(null);
    setStatus(null);
    try {
      if (!registry) throw new Error("Registry address is not configured.");
      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "burn",
        args: [BigInt(tokenId)],
      });
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: registry,
        data,
        value: "0x0",
        chainId: activeChain.id,
      });
      setStatus("Burned. The track is gone and the id cannot be reused.");
      setConfirmingBurn(false);
      setBurnConfirmText("");
      onChanged?.();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not burn the track.");
    } finally {
      setBusy(null);
    }
  };

  const togglePause = async () => {
    setBusy("pause");
    setError(null);
    setStatus(null);
    try {
      const next = !paused;
      const data = encodeFunctionData({
        abi: SALES_ABI,
        functionName: "setSalesPaused",
        args: [BigInt(tokenId), next],
      });
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: sales,
        data,
        value: "0x0",
        chainId: activeChain.id,
      });
      setStatus(
        next
          ? "Taken off sale. Licences already sold keep working."
          : "Back on sale.",
      );
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not change the sale status.");
    } finally {
      setBusy(null);
    }
  };

  const shell = dark
    ? "border-gray-700 bg-black/30"
    : "border-gray-200 bg-gray-50";
  const heading = dark ? "text-gray-200" : "text-gray-700";
  const label = dark ? "text-gray-400" : "text-gray-600";
  const field = dark
    ? "border-gray-600 bg-black/40 text-white"
    : "border-gray-300 text-gray-900";
  const note = dark ? "text-gray-400" : "text-gray-500";

  return (
    <div className={`mt-3 p-3 rounded-xl border ${shell}`}>
      <p className={`text-xs font-bold ${heading} mb-2`}>Your track</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className={`flex flex-col text-xs ${label}`}>
          Standard licence (WMON)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`mt-1 w-32 px-2 py-1 rounded border text-sm ${field}`}
          />
        </label>
        <label className={`flex flex-col text-xs ${label}`}>
          Limited edition (WMON)
          <input
            type="number"
            min="0"
            step="1"
            value={collectorPrice}
            onChange={(e) => setCollectorPrice(e.target.value)}
            className={`mt-1 w-32 px-2 py-1 rounded border text-sm ${field}`}
          />
        </label>
        <button
          onClick={savePrice}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy === "price" ? "Saving…" : "Save price"}
        </button>
        <button
          onClick={togglePause}
          disabled={busy !== null}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
            paused ? "bg-green-600 text-white" : "bg-gray-700 text-white"
          }`}
        >
          {busy === "pause"
            ? "Working…"
            : paused
              ? "Put back on sale"
              : "Take off sale"}
        </button>
      </div>

      <p className={`text-[11px] ${note} mt-2`}>
        Two separate prices. A buyer choosing a standard licence pays the first;
        a buyer choosing the limited edition pays the second. Setting them equal
        makes the limited edition pointless.
      </p>

      <p className={`text-[11px] ${note} mt-1`}>
        {paused
          ? "Not for sale. Licences already sold keep working."
          : "On sale. Changing a price does not affect licences already sold."}
      </p>

      {!confirmingBurn ? (
        <button
          onClick={() => setConfirmingBurn(true)}
          disabled={busy !== null}
          className={`mt-3 text-[11px] underline disabled:opacity-50 ${
            dark ? "text-red-400" : "text-red-600"
          }`}
        >
          Remove this track permanently
        </button>
      ) : (
        <div
          className={`mt-3 p-3 rounded-lg border ${
            dark ? "border-red-800 bg-red-950/40" : "border-red-300 bg-red-50"
          }`}
        >
          <p
            className={`text-xs font-bold ${dark ? "text-red-300" : "text-red-700"}`}
          >
            This cannot be undone.
          </p>
          <p className={`text-[11px] mt-1 ${note}`}>
            Burning destroys the master. The token id can never be reused, and
            you cannot re-mint this track under it.
            {collectorsMinted !== null && collectorsMinted > 0 && (
              <>
                {" "}
                <strong>
                  {collectorsMinted} limited edition
                  {collectorsMinted === 1 ? "" : "s"} already sold
                </strong>{" "}
                will point at a master that no longer exists.
              </>
            )}{" "}
            If you only want it off the store, use “Take off sale” instead —
            that keeps every licence already sold working.
          </p>
          <label className={`flex flex-col text-xs mt-2 ${label}`}>
            Type{" "}
            <span className="font-mono font-bold">{trackName || "BURN"}</span>{" "}
            to confirm
            <input
              value={burnConfirmText}
              onChange={(e) => setBurnConfirmText(e.target.value)}
              className={`mt-1 px-2 py-1 rounded border text-sm ${field}`}
            />
          </label>
          <div className="flex gap-2 mt-2">
            <button
              onClick={burnMaster}
              disabled={
                busy !== null || burnConfirmText !== (trackName || "BURN")
              }
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
            >
              {busy === "burn" ? "Burning…" : "Burn permanently"}
            </button>
            <button
              onClick={() => {
                setConfirmingBurn(false);
                setBurnConfirmText("");
              }}
              disabled={busy !== null}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                dark ? "bg-gray-700 text-white" : "bg-gray-200 text-gray-800"
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <p
          className={`text-xs mt-1 ${dark ? "text-green-400" : "text-green-700"}`}
        >
          {status}
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-1">❌ {error}</p>}
    </div>
  );
}
