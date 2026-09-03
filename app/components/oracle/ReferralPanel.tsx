"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
} from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import {
  SUBSCRIPTION_REFERRALS_ABI,
  referralsAddress,
} from "@/lib/subscription-referrals";
import { referralLinkFor } from "@/lib/referral-link";
import { parseEther, parseAbi } from "viem";

/**
 * Share a link, earn a share of the platform fee when someone subscribes.
 *
 * Three separate things have to be true for a referral to pay, and each fails
 * silently on its own, so this reports them rather than showing a link that
 * quietly earns nothing:
 *
 *   referrerBps > 0     — the rate. Ships at 3000 (30% of the platform fee).
 *   pool is funded      — commission accrues only up to what the pool backs;
 *                         an empty pool emits ReferralSkippedUnderfunded and
 *                         pays nobody without failing the subscription.
 *   trustedRelayer set  — the app pays from each user's own Safe, and only the
 *                         subscriber or the trusted relayer may bind attribution.
 *
 * Claiming is a wallet transaction: commission accrues to the address in the
 * link, and only that address can claim it.
 */

interface Props {
  dark?: boolean;
}

export function ReferralPanel({ dark }: Props) {
  const { walletAddress, sendTransaction, switchChain } = useWalletContext();
  const router = referralsAddress();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [bps, setBps] = useState<bigint | null>(null);
  const [unreserved, setUnreserved] = useState<bigint | null>(null);
  const [relayer, setRelayer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [topUp, setTopUp] = useState("");
  const [funding, setFunding] = useState(false);

  const load = useCallback(async () => {
    if (!router || !walletAddress) return;
    try {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      });
      const read = (functionName: string, args: unknown[] = []) =>
        client.readContract({
          address: router,
          abi: SUBSCRIPTION_REFERRALS_ABI,
          functionName: functionName as never,
          args: args as never,
        });
      const [b, r, u, t] = await Promise.all([
        read("referralBalance", [walletAddress]),
        read("referrerBps"),
        read("unreserved"),
        read("trustedRelayer"),
      ]);
      setBalance(b as bigint);
      setBps(r as bigint);
      setUnreserved(u as bigint);
      setRelayer(t as string);
    } catch {
      // A failed read must not render a claim button that would revert.
      setBalance(null);
    }
  }, [router, walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!router || !walletAddress) return null;

  const link = referralLinkFor(walletAddress);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  // fund() is unpermissioned -- anyone may top up the pool -- but a "fund the
  // reward pool" control in every listener's profile is noise, so it is shown
  // only to the configured operator address.
  const admin = (process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "").toLowerCase();
  const isOperator = admin.length > 0 && walletAddress?.toLowerCase() === admin;

  /**
   * Top up the commission pool: wrap the shortfall, approve, fund.
   *
   * Three transactions from the operator's own wallet, narrated, because an
   * unexplained second prompt reads as a stuck app. Wrapping only the shortfall
   * means WMON already held is used rather than stranded.
   */
  const fundPool = async () => {
    setFunding(true);
    setError(null);
    setStatus(null);
    try {
      const wmon = process.env.NEXT_PUBLIC_WMON as `0x${string}` | undefined;
      if (!wmon) throw new Error("WMON is not configured.");
      const amount = Number(topUp);
      if (!topUp || isNaN(amount) || amount <= 0) {
        throw new Error("Enter an amount greater than zero.");
      }
      const wei = parseEther(topUp);

      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      });
      const erc20 = parseAbi([
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function deposit() external payable",
      ]);

      await switchChain({ chainId: activeChain.id });

      const held = (await client.readContract({
        address: wmon,
        abi: erc20,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      })) as bigint;
      if (held < wei) {
        setStatus("Step 1 of 3 — wrapping MON…");
        await sendTransaction({
          to: wmon,
          data: encodeFunctionData({ abi: erc20, functionName: "deposit" }),
          value: `0x${(wei - held).toString(16)}`,
          chainId: activeChain.id,
        });
      }

      const allowed = (await client.readContract({
        address: wmon,
        abi: erc20,
        functionName: "allowance",
        args: [walletAddress as `0x${string}`, router],
      })) as bigint;
      if (allowed < wei) {
        setStatus("Step 2 of 3 — approving WMON…");
        await sendTransaction({
          to: wmon,
          data: encodeFunctionData({
            abi: erc20,
            functionName: "approve",
            args: [router, wei],
          }),
          value: "0x0",
          chainId: activeChain.id,
        });
      }

      setStatus("Step 3 of 3 — funding the pool…");
      await sendTransaction({
        to: router,
        data: encodeFunctionData({
          abi: SUBSCRIPTION_REFERRALS_ABI,
          functionName: "fund",
          args: [wei],
        }),
        value: "0x0",
        chainId: activeChain.id,
      });

      setStatus(`Pool topped up by ${topUp} WMON.`);
      setTopUp("");
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not fund the pool.");
    } finally {
      setFunding(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const data = encodeFunctionData({
        abi: SUBSCRIPTION_REFERRALS_ABI,
        functionName: "claimReferral",
      });
      await switchChain({ chainId: activeChain.id });
      await sendTransaction({
        to: router,
        data,
        value: "0x0",
        chainId: activeChain.id,
      });
      setStatus("Claimed.");
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not claim.");
    } finally {
      setBusy(false);
    }
  };

  const shell = dark
    ? "bg-black/20 border-gray-700/50"
    : "bg-gray-50 border-gray-200";
  const heading = dark ? "text-white" : "text-gray-900";
  const note = dark ? "text-gray-400" : "text-gray-500";
  const field = dark
    ? "border-gray-600 bg-black/40 text-white"
    : "border-gray-300 bg-white text-gray-900";

  // Honest status, in the order that actually blocks a payout.
  const blockers: string[] = [];
  if (bps !== null && bps === 0n) blockers.push("the rate is set to zero");
  if (unreserved !== null && unreserved === 0n)
    blockers.push("the reward pool is empty");
  if (relayer && /^0x0{40}$/i.test(relayer))
    blockers.push("attribution is not switched on yet");

  return (
    <div className={`rounded-xl border p-4 ${shell}`}>
      <h4 className={`font-medium mb-1 ${heading}`}>Refer a listener</h4>
      <p className={`text-[11px] mb-3 ${note}`}>
        {bps !== null && bps > 0n
          ? `You earn ${Number(bps) / 100}% of the platform fee every time someone who joined through your link pays, for a year. It comes out of the platform's share — never the artist's.`
          : "You earn a share of the platform fee when someone who joined through your link subscribes."}
      </p>

      <label className={`flex flex-col text-xs ${note}`}>
        Your link
        <div className="flex gap-2 mt-1">
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
      </label>

      <div className="flex items-center justify-between mt-3">
        <div>
          <p className={`text-[11px] ${note}`}>Earned, unclaimed</p>
          <p className={`text-lg font-bold ${heading}`}>
            {balance === null ? "—" : `${formatEther(balance)} WMON`}
          </p>
        </div>
        <button
          onClick={claim}
          disabled={busy || balance === null || balance === 0n}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "Claiming…" : "Claim"}
        </button>
      </div>

      {isOperator && (
        <div
          className={`mt-4 pt-3 border-t ${dark ? "border-gray-700" : "border-gray-200"}`}
        >
          <p className={`text-[11px] font-bold ${heading}`}>
            Reward pool — operator only
          </p>
          <p className={`text-[11px] mt-1 ${note}`}>
            Commission accrues only up to what the pool backs, so an empty pool
            pays nobody and says nothing. About 9 WMON covers one monthly
            referral. Not spent — governance can withdraw whatever is unclaimed.
            {unreserved !== null && (
              <>
                {" "}
                Available now: <strong>{formatEther(unreserved)} WMON</strong>.
              </>
            )}
          </p>
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="27"
              value={topUp}
              onChange={(e) => setTopUp(e.target.value)}
              className={`w-24 px-2 py-1 rounded border text-sm ${field}`}
            />
            <button
              onClick={fundPool}
              disabled={funding || !topUp}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-40"
            >
              {funding ? "Funding…" : "Fund pool"}
            </button>
          </div>
        </div>
      )}

      {blockers.length > 0 && (
        <p className={`text-[11px] mt-3 ${note}`}>
          Not paying out yet — {blockers.join(", ")}. Your link still works and
          people can still subscribe through it; nothing accrues until this is
          switched on.
        </p>
      )}

      <p className={`text-[11px] mt-2 ${note}`}>
        Only counts on someone&apos;s first ever subscription. Anyone already
        subscribed cannot be referred.
      </p>

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
