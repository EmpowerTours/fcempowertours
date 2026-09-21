"use client";

/**
 * Send MON out of the connected wallet.
 *
 * ## Why this exists when /send-mon already did
 *
 * `/send-mon` reads `useFarcasterContext` directly, so it cannot see the passkey wallet at
 * all, and it sends with `chainId: monadTestnet.id` — a mainnet balance moved through it
 * would prompt on the wrong chain and transfer nothing. It also posts to a Telegram bot
 * callback, which is a flow nobody wanted to disturb. This page is the plain one: the
 * connected wallet, mainnet, one transfer.
 *
 * It goes through `useWalletContext`, so the same code serves the Farcaster wallet and the
 * browser passkey wallet without knowing which it has.
 *
 * ## The reserve, and why Max is not the balance
 *
 * Monad charges the FULL gas limit with no refund. A wallet emptied to the last wei cannot
 * pay for the transfer that empties it, and — worse for a hunter — cannot collect the next
 * spawn either. Max therefore leaves `GAS_RESERVE` behind, and says so rather than silently
 * sending less than the button implies.
 *
 * ## The confirm step is the point
 *
 * A mistyped destination is unrecoverable, and the single most expensive mistake available
 * on this page is sending to an exchange's HOT wallet — the address a withdrawal came
 * FROM — instead of that exchange's deposit address. Exchanges generally do not credit
 * those, so the confirm step shows the destination in full, unabbreviated, and says this out
 * loud. Truncating an address to 0x1234…abcd in a confirmation defeats the confirmation:
 * the middle is exactly where a wrong address differs.
 */

import { useCallback, useEffect, useState } from "react";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import { monadMainnet } from "@/app/chains";

/**
 * Left behind by Max. A plain EOA transfer is 21,000 gas, but Monad bills the whole limit,
 * so this is deliberately far more than one transfer costs — it is walking-around money, not
 * a fee estimate.
 */
const GAS_RESERVE_MON = 0.05;

type Phase = "idle" | "confirming" | "sending" | "sent" | "error";

export default function SendMonPage() {
  const { walletAddress, isConnected, connectWallet, sendTransaction } =
    useWalletContext();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  const loadBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const { createPublicClient, http, formatEther } = await import("viem");
      // The keyless public RPC: this module reaches the client, and naming the private one
      // here would ship its key in the bundle.
      const client = createPublicClient({
        chain: monadMainnet,
        transport: http("https://rpc.monad.xyz"),
      });
      const wei = await client.getBalance({
        address: walletAddress as `0x${string}`,
      });
      setBalance(formatEther(wei));
    } catch {
      setBalance(null);
    }
  }, [walletAddress]);

  // Read once the address is known, and again after a send. useEffect, not useMemo —
  // useMemo is for computing a value and React is free to skip or re-run it, so a fetch
  // hung there fires unpredictably and never on purpose.
  useEffect(() => {
    if (walletAddress) void loadBalance();
  }, [walletAddress, loadBalance]);

  const toValid = /^0x[a-fA-F0-9]{40}$/.test(to.trim());
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overBalance =
    balance !== null && amountValid && amountNum > Number(balance);

  const setMax = () => {
    if (balance === null) return;
    const max = Number(balance) - GAS_RESERVE_MON;
    // Never offer a negative max. A wallet below the reserve simply cannot send.
    setAmount(max > 0 ? String(max) : "0");
  };

  const send = async () => {
    setPhase("sending");
    setMessage("");
    try {
      const { parseEther } = await import("viem");
      const res = await sendTransaction({
        // Named on the call. Without it the Farcaster wallet stays on whatever chain it is
        // already on — Base by default — and the user approves a transfer that silently does
        // nothing. verify-tx-names-its-chain enforces this repo-wide.
        chainId: monadMainnet.id,
        to: to.trim(),
        value: parseEther(amount).toString(),
      });
      const hash =
        typeof res === "string" ? res : (res?.transactionHash ?? res?.hash);
      setTxHash(typeof hash === "string" ? hash : "");
      setPhase("sent");
      await loadBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      setPhase("error");
      setMessage(
        /user rejected|denied/i.test(msg) ? "Cancelled in wallet." : msg,
      );
    }
  };

  if (!isConnected) {
    return (
      <main style={wrap}>
        <h1 style={h1}>Send MON</h1>
        <p style={dim}>Connect the wallet you want to send from.</p>
        <button onClick={connectWallet} style={btnPrimary}>
          Connect wallet
        </button>
      </main>
    );
  }

  if (phase === "sent") {
    return (
      <main style={wrap}>
        <h1 style={h1}>Sent</h1>
        <p style={dim}>
          {amount} MON to {to.trim()}
        </p>
        {txHash ? (
          <a
            href={`https://monadscan.com/tx/${txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: "#E4007C", fontSize: 13 }}
          >
            view on monadscan ↗
          </a>
        ) : null}
        <p style={dim}>Balance now: {balance ?? "…"} MON</p>
        <button
          onClick={() => {
            setPhase("idle");
            setAmount("");
            setTo("");
            setTxHash("");
          }}
          style={btn}
        >
          Send another
        </button>
      </main>
    );
  }

  if (phase === "confirming") {
    return (
      <main style={wrap}>
        <h1 style={h1}>Confirm</h1>
        <div style={card}>
          <div style={dim}>Sending</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{amount} MON</div>
          <div style={{ ...dim, marginTop: 12 }}>To this address, in full</div>
          {/* Never truncated. The middle of an address is exactly where a wrong one differs. */}
          <div style={mono}>{to.trim()}</div>
        </div>
        <p style={warn}>
          If this is an exchange, it must be that exchange&apos;s{" "}
          <strong>deposit address</strong> for Monad — taken from its deposit
          page. Sending to the address a withdrawal came from is the
          exchange&apos;s hot wallet, and those deposits are usually not
          credited. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPhase("idle")} style={btn}>
            Back
          </button>
          <button onClick={() => void send()} style={btnPrimary}>
            Send it
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={h1}>Send MON</h1>
      <div style={card}>
        <div style={dim}>From</div>
        <div style={mono}>{walletAddress}</div>
        <div style={{ ...dim, marginTop: 8 }}>
          Balance: {balance ?? "…"} MON
        </div>
      </div>

      <label style={dim}>To</label>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="0x…"
        style={input}
        autoComplete="off"
        spellCheck={false}
      />
      {to.length > 0 && !toValid ? (
        <p style={err}>That is not a valid address.</p>
      ) : null}

      <label style={dim}>Amount</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          style={{ ...input, flex: 1 }}
        />
        <button onClick={setMax} style={btn} disabled={balance === null}>
          Max
        </button>
      </div>
      <p style={dim}>
        Max leaves {GAS_RESERVE_MON} MON behind. Monad charges the full gas
        limit, so a wallet emptied to the last wei cannot pay for the transfer
        that empties it.
      </p>
      {overBalance ? <p style={err}>More than the balance.</p> : null}
      {phase === "error" && message ? <p style={err}>{message}</p> : null}

      <button
        onClick={() => setPhase("confirming")}
        disabled={
          !toValid || !amountValid || overBalance || phase === "sending"
        }
        style={{
          ...btnPrimary,
          opacity: !toValid || !amountValid || overBalance ? 0.4 : 1,
        }}
      >
        {phase === "sending" ? "Sending…" : "Review"}
      </button>
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 460,
  margin: "0 auto",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontFamily: "system-ui, sans-serif",
};
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0 };
const dim: React.CSSProperties = { fontSize: 12, opacity: 0.65, margin: 0 };
const err: React.CSSProperties = { fontSize: 12, color: "#f87171", margin: 0 };
const warn: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  background: "rgba(234,179,8,0.10)",
  border: "1px solid rgba(234,179,8,0.35)",
  borderRadius: 8,
  padding: 10,
};
const card: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.3)",
  borderRadius: 10,
  padding: 12,
};
const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 13,
  wordBreak: "break-all",
};
const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
};
const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid currentColor",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#E4007C",
  borderColor: "#E4007C",
  color: "#fff",
  fontWeight: 700,
};
