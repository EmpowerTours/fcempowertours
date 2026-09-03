"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseAbi,
} from "viem";
import { activeChain } from "@/app/chains";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import {
  decodeSaleLink,
  SALES_CONTROLLER_SALE_ABI,
  type SaleOrder,
} from "@/lib/sale-order";

/**
 * Buy a licence from a link.
 *
 * Everything the buyer needs is checked against the chain before a wallet is
 * opened, because every one of these reverts with an error nobody can read:
 * the seller no longer owns it, the nonce is spent, the deadline has passed,
 * you are the seller. Showing "this offer is no longer valid" beats a raw
 * revert after someone has already approved a payment.
 *
 * Opening this page spends nothing. `executeSale` requires payment from the
 * caller and consumes the nonce on chain, so a chat app fetching the URL to
 * build a preview card cannot consume the offer.
 */

const REGISTRY_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address, uint256)",
  "function getLicense(uint256 licenseId) view returns (uint256 masterTokenId, uint64 mintedAt, bool isCollector)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function deposit() external payable",
]);

type Blocker =
  | "expired"
  | "spent"
  | "not-owner"
  | "own-listing"
  | "bad-link"
  | "unverified"
  | null;

export default function BuyLicencePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { walletAddress, sendTransaction, switchChain } = useWalletContext();

  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [blocker, setBlocker] = useState<Blocker>(null);
  const [royalty, setRoyalty] = useState<bigint | null>(null);
  const [isCollector, setIsCollector] = useState<boolean | null>(null);
  const [wmonBalance, setWmonBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [monBalance, setMonBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<null | "wrap" | "approve" | "buy">(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sales = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | `0x${string}`
    | undefined;
  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as
    | `0x${string}`
    | undefined;
  const wmon = process.env.NEXT_PUBLIC_WMON as `0x${string}` | undefined;

  const load = useCallback(async () => {
    const decoded = decodeSaleLink(token);
    if (!decoded) {
      setBlocker("bad-link");
      return;
    }
    setOrder(decoded.order);
    setSignature(decoded.signature);

    // Without the contracts there is no way to check the seller still owns it,
    // that the nonce is unspent, or what the royalty is. Rendering the price and
    // a Buy button anyway would present an unverified offer as a sound one.
    if (!sales || !registry) {
      setBlocker("unverified");
      return;
    }
    const client = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    try {
      const [owner, royaltyInfo, licence, spent] = await Promise.all([
        client.readContract({
          address: registry,
          abi: REGISTRY_ABI,
          functionName: "ownerOf",
          args: [decoded.order.licenseId],
        }),
        client.readContract({
          address: registry,
          abi: REGISTRY_ABI,
          functionName: "royaltyInfo",
          args: [decoded.order.licenseId, decoded.order.price],
        }),
        client.readContract({
          address: registry,
          abi: REGISTRY_ABI,
          functionName: "getLicense",
          args: [decoded.order.licenseId],
        }),
        client.readContract({
          address: sales,
          abi: SALES_CONTROLLER_SALE_ABI,
          functionName: "usedNonces",
          args: [decoded.order.seller, decoded.order.nonce],
        }),
      ]);

      setRoyalty((royaltyInfo as unknown as [string, bigint])[1]);
      setIsCollector((licence as unknown as unknown[])[2] as boolean);

      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now > decoded.order.deadline) setBlocker("expired");
      else if (spent as boolean) setBlocker("spent");
      else if (
        (owner as string).toLowerCase() !== decoded.order.seller.toLowerCase()
      )
        setBlocker("not-owner");
      else if (
        walletAddress &&
        walletAddress.toLowerCase() === decoded.order.seller.toLowerCase()
      )
        setBlocker("own-listing");
      else setBlocker(null);
    } catch {
      setBlocker("bad-link");
    }

    if (walletAddress && wmon && sales) {
      try {
        const [bal, allw, mon] = await Promise.all([
          client.readContract({
            address: wmon,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [walletAddress as `0x${string}`],
          }),
          client.readContract({
            address: wmon,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [walletAddress as `0x${string}`, sales],
          }),
          client.getBalance({ address: walletAddress as `0x${string}` }),
        ]);
        setWmonBalance(bal as bigint);
        setAllowance(allw as bigint);
        setMonBalance(mon);
      } catch {
        setWmonBalance(null);
      }
    }
  }, [token, sales, registry, wmon, walletAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (
    to: `0x${string}`,
    data: `0x${string}`,
    value = "0x0",
  ) => {
    await switchChain({ chainId: activeChain.id });
    return sendTransaction({ to, data, value, chainId: activeChain.id });
  };

  const wrap = async () => {
    if (!order || !wmon) return;
    setBusy("wrap");
    setError(null);
    try {
      const short = order.price - (wmonBalance ?? 0n);
      await send(
        wmon,
        encodeFunctionData({ abi: ERC20_ABI, functionName: "deposit" }),
        `0x${short.toString(16)}`,
      );
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not wrap MON.");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!order || !wmon || !sales) return;
    setBusy("approve");
    setError(null);
    try {
      await send(
        wmon,
        encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [sales, order.price],
        }),
      );
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? "Could not approve.");
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    if (!order || !signature || !sales) return;
    setBusy("buy");
    setError(null);
    try {
      await send(
        sales,
        encodeFunctionData({
          abi: SALES_CONTROLLER_SALE_ABI,
          functionName: "executeSale",
          args: [order, signature],
        }),
      );
      setDone(true);
    } catch (e) {
      setError((e as Error)?.message ?? "The purchase did not go through.");
    } finally {
      setBusy(null);
    }
  };

  const card =
    "max-w-md mx-auto mt-10 rounded-2xl border border-gray-700 bg-gray-900 p-6 text-white";

  if (blocker === "bad-link") {
    return (
      <div className={card}>
        <h1 className="text-xl font-bold mb-2">This offer is not valid</h1>
        <p className="text-sm text-gray-400">
          The link is incomplete or was changed. Ask the seller for a new one.
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={card}>
        <p className="text-sm text-gray-400">Reading the offer…</p>
      </div>
    );
  }

  const sellerGets = royalty !== null ? order.price - royalty : null;
  const needsWrap = wmonBalance !== null && wmonBalance < order.price;
  const canWrap =
    needsWrap && monBalance !== null && monBalance >= order.price - wmonBalance;
  const needsApproval =
    !needsWrap && allowance !== null && allowance < order.price;

  return (
    <div className={card}>
      <h1 className="text-xl font-bold mb-1">
        Licence #{order.licenseId.toString()}
      </h1>
      <p className="text-sm text-gray-400 mb-4">
        {isCollector === null
          ? " "
          : isCollector
            ? "Limited edition"
            : "Standard licence"}
      </p>

      <div className="rounded-xl bg-black/30 p-4 mb-4">
        <p className="text-3xl font-bold">{formatEther(order.price)} WMON</p>
        {royalty !== null && sellerGets !== null && (
          <p className="text-xs text-gray-400 mt-2">
            {formatEther(royalty)} goes to the artist as royalty,{" "}
            {formatEther(sellerGets)} to the seller. Taken by the contract, not
            by us.
          </p>
        )}
        <p className="text-[11px] text-gray-500 mt-2">
          Offer expires{" "}
          {new Date(Number(order.deadline) * 1000).toLocaleString()}
        </p>
      </div>

      {done ? (
        <p className="text-green-400 font-semibold">
          Bought. The licence is in your wallet.
        </p>
      ) : blocker === "expired" ? (
        <p className="text-sm text-amber-400">
          This offer has expired. Ask the seller for a new link.
        </p>
      ) : blocker === "spent" ? (
        <p className="text-sm text-amber-400">
          Already sold — someone used this link first.
        </p>
      ) : blocker === "not-owner" ? (
        <p className="text-sm text-amber-400">
          The seller no longer holds this licence, so the offer can&apos;t be
          honoured.
        </p>
      ) : blocker === "unverified" ? (
        <p className="text-sm text-amber-400">
          This offer can&apos;t be verified right now, so it isn&apos;t safe to
          buy. Try again shortly.
        </p>
      ) : blocker === "own-listing" ? (
        <p className="text-sm text-gray-400">
          This is your own offer. Send the link to your buyer.
        </p>
      ) : !walletAddress ? (
        <p className="text-sm text-gray-400">
          Connect a wallet to buy this licence.
        </p>
      ) : needsWrap ? (
        <>
          <p className="text-xs text-gray-400 mb-2">
            You need {formatEther(order.price - (wmonBalance ?? 0n))} more WMON.
            {canWrap
              ? " Wrap it from your MON first."
              : " Not enough MON to wrap."}
          </p>
          <button
            onClick={wrap}
            disabled={!canWrap || busy !== null}
            className="w-full py-2.5 rounded-lg bg-purple-600 font-semibold disabled:opacity-40"
          >
            {busy === "wrap" ? "Wrapping…" : "Wrap MON to WMON"}
          </button>
        </>
      ) : needsApproval ? (
        <button
          onClick={approve}
          disabled={busy !== null}
          className="w-full py-2.5 rounded-lg bg-purple-600 font-semibold disabled:opacity-40"
        >
          {busy === "approve" ? "Approving…" : "Approve WMON"}
        </button>
      ) : (
        <button
          onClick={buy}
          disabled={busy !== null}
          className="w-full py-2.5 rounded-lg bg-green-600 font-semibold disabled:opacity-40"
        >
          {busy === "buy"
            ? "Buying…"
            : `Buy for ${formatEther(order.price)} WMON`}
        </button>
      )}

      {error && <p className="text-xs text-red-400 mt-3">❌ {error}</p>}
    </div>
  );
}
