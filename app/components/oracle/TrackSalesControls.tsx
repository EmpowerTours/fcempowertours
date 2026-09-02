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
]);

interface Props {
  tokenId: string | number;
  /** Rendered only when this matches the master's on-chain artist. */
  onChanged?: () => void;
}

export function TrackSalesControls({ tokenId, onChanged }: Props) {
  const { walletAddress, sendTransaction, switchChain } = useWalletContext();

  const [isArtist, setIsArtist] = useState(false);
  const [price, setPrice] = useState("");
  const [collectorPrice, setCollectorPrice] = useState("");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<null | "price" | "pause">(null);
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

  return (
    <div className="mt-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
      <p className="text-xs font-bold text-gray-700 mb-2">Your track</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-gray-600">
          Licence price (WMON)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-32 px-2 py-1 rounded border border-gray-300 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-600">
          Collector price (WMON)
          <input
            type="number"
            min="0"
            step="1"
            value={collectorPrice}
            onChange={(e) => setCollectorPrice(e.target.value)}
            className="mt-1 w-32 px-2 py-1 rounded border border-gray-300 text-sm text-gray-900"
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

      <p className="text-[11px] text-gray-500 mt-2">
        {paused
          ? "Not for sale. Licences already sold keep working."
          : "On sale. Changing the price does not affect licences already sold."}
      </p>

      {status && <p className="text-xs text-green-700 mt-1">{status}</p>}
      {error && <p className="text-xs text-red-600 mt-1">❌ {error}</p>}
    </div>
  );
}
