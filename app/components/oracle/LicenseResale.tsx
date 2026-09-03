"use client";

import React, { useState } from "react";
import { parseEther } from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import {
  buildSaleOrder,
  encodeSaleLink,
  saleDomain,
  saleMessage,
  SALE_ORDER_TYPES,
} from "@/lib/sale-order";

/**
 * Sell a licence by sending someone a link.
 *
 * The seller signs the terms; no transaction, no gas, nothing listed anywhere.
 * Whoever opens the link and pays gets the licence, and the artist's royalty is
 * taken automatically by the contract on the way through.
 *
 * Deliberately not a marketplace. There is no board of listings to browse and
 * no price discovery — you decide a price and give the link to a person.
 */

interface Props {
  licenseId: string | number;
  name?: string;
  dark?: boolean;
}

export function LicenseResale({ licenseId, name, dark }: Props) {
  const { walletAddress, signTypedData, switchChain } = useWalletContext();

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sales = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | `0x${string}`
    | undefined;

  if (!walletAddress || !sales) return null;

  const createLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const priceNum = Number(price);
      if (!price || isNaN(priceNum) || priceNum <= 0) {
        throw new Error("Set a price greater than zero.");
      }

      const order = buildSaleOrder({
        licenseId: BigInt(licenseId),
        seller: walletAddress as `0x${string}`,
        price: parseEther(price),
      });

      // chainId on the domain, always: a signature over the wrong chain id
      // verifies nowhere, and the wallet gives no hint that it happened.
      await switchChain({ chainId: activeChain.id });
      const signature = await signTypedData({
        domain: saleDomain(activeChain.id, sales) as unknown as Record<
          string,
          unknown
        >,
        types: SALE_ORDER_TYPES as unknown as Record<string, unknown>,
        primaryType: "SaleOrder",
        message: saleMessage(order),
      });

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setLink(`${origin}/licence/${encodeSaleLink(order, signature)}`);
    } catch (e) {
      setError((e as Error)?.message ?? "Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  const note = dark ? "text-gray-400" : "text-gray-500";
  const field = dark
    ? "border-gray-600 bg-black/40 text-white"
    : "border-gray-300 bg-white text-gray-900";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mt-2 text-[11px] underline ${dark ? "text-cyan-400" : "text-cyan-700"}`}
      >
        Sell this licence
      </button>
    );
  }

  return (
    <div
      className={`mt-2 p-3 rounded-lg border ${
        dark ? "border-gray-700 bg-black/30" : "border-gray-200 bg-gray-50"
      }`}
    >
      <p
        className={`text-xs font-bold mb-2 ${dark ? "text-gray-200" : "text-gray-700"}`}
      >
        Sell {name ? `“${name}”` : `licence #${licenseId}`}
      </p>

      {!link ? (
        <>
          <label className={`flex flex-col text-xs ${note}`}>
            Price (WMON)
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`mt-1 w-32 px-2 py-1 rounded border text-sm ${field}`}
            />
          </label>
          <p className={`text-[11px] mt-2 ${note}`}>
            Signing costs nothing and sends no transaction. The artist&apos;s
            royalty is taken from the sale automatically. The offer expires in
            30 days — there is no cancel button, so a short life is the safety.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={createLink}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-sm font-semibold disabled:opacity-40"
            >
              {busy ? "Signing…" : "Create link"}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                dark ? "bg-gray-700 text-white" : "bg-gray-200 text-gray-800"
              }`}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={`text-[11px] mb-1 ${note}`}>
            Send this to your buyer. Anyone who opens it can buy at {price} WMON
            until it expires.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className={`flex-1 min-w-0 px-2 py-1 rounded border text-xs ${field}`}
            />
            <button
              onClick={copy}
              className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold whitespace-nowrap"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-600 mt-2">❌ {error}</p>}
    </div>
  );
}
