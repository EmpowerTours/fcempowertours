"use client";

/**
 * A wagmi connector for the EmpowerTours passkey wallet.
 *
 * ## Why a connector and not a parallel wallet path
 *
 * Outside Farcaster this app already reads `useAccount`, `useSignMessage` and
 * `useSendTransaction` from wagmi (`app/hooks/useWalletContext.tsx`). Expressing the passkey
 * wallet as a connector means every existing call site keeps working untouched — the mint flow,
 * `useActionAuth`'s browser branch, the chain-naming fix, all of it. A parallel path would have
 * meant editing each of them and getting one wrong.
 *
 * Inside Farcaster this is never used: that host has its own wallet, which is the intended
 * split. This is the browser signer.
 *
 * ## The provider shim, and why it exists
 *
 * mera hands back a viem `LocalAccount` — it signs, it does not broadcast, and it is not
 * EIP-1193. wagmi and the app both speak EIP-1193 (`provider.request({ method: … })`), so this
 * wraps the account in the smallest shim that answers the methods actually used:
 *
 *   eth_accounts / eth_requestAccounts   the address
 *   eth_chainId                          always Monad
 *   personal_sign                        EIP-191 via the account
 *   eth_signTypedData_v4                 EIP-712 via the account
 *   eth_sendTransaction                  signed locally, then broadcast
 *   wallet_switchEthereumChain           accepted and ignored — see below
 *
 * `wallet_switchEthereumChain` resolves rather than throwing. A local account has no chain to
 * switch; it signs for whatever chain it is told. Throwing would break every caller that
 * politely asks first — including `lib/epk-publish.ts` and `artist-claim.ts`, which switch
 * before sending precisely because the Farcaster wallet needs it. Accepting a no-op keeps one
 * code path working against two very different wallets.
 *
 * ## The session is the key
 *
 * `createSecp256k1SigningSession` holds the private key in memory until `end()` is called, and
 * ending it zeroes the key. Disconnecting ends it. Nothing is persisted: on a page reload the
 * user taps their passkey again, which is the correct trade for a key that never touches disk.
 */

import { createConnector } from "wagmi";
import type { WalletDetailsParams } from "@rainbow-me/rainbowkit";
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { monadMainnet } from "@/app/chains";
import { openSigner } from "./ceremony";

type Signer = Awaited<ReturnType<typeof openSigner>>;

/** Monad mainnet. The only chain this wallet signs for. */
const CHAIN_ID = monadMainnet.id;

export function passkeyConnector() {
  let signer: Signer | null = null;

  /** Smallest EIP-1193 surface the app actually uses. */
  function providerFor(s: Signer) {
    const wallet = createWalletClient({
      account: s.account,
      chain: monadMainnet,
      transport: http(),
    });
    const pub = createPublicClient({ chain: monadMainnet, transport: http() });

    return {
      async request({
        method,
        params,
      }: {
        method: string;
        params?: readonly unknown[];
      }): Promise<unknown> {
        switch (method) {
          case "eth_accounts":
          case "eth_requestAccounts":
            return [s.account.address];
          case "eth_chainId":
            return `0x${CHAIN_ID.toString(16)}`;
          case "wallet_switchEthereumChain":
            // A local account has no chain to switch. Callers ask politely before sending;
            // refusing would break them for no gain.
            return null;
          case "personal_sign": {
            const [data] = (params ?? []) as [Hex];
            return s.account.signMessage({ message: { raw: data } });
          }
          case "eth_signTypedData_v4": {
            const [, json] = (params ?? []) as [Address, string];
            return s.account.signTypedData(JSON.parse(json));
          }
          case "eth_sendTransaction": {
            const [tx] = (params ?? []) as [
              { to: Address; data?: Hex; value?: Hex; gas?: Hex },
            ];
            // Signed here and broadcast by us: a local account cannot ask a wallet app to do
            // it. viem fills nonce, gas and fees from the chain.
            return wallet.sendTransaction({
              // Named on the CALL, not only on the client it came from. The client already
              // carries `chain: monadMainnet`, so this is redundant — deliberately. A reader,
              // and verify-tx-names-its-chain, should be able to see which chain a transaction
              // is for without tracing back to where the client was built.
              chain: monadMainnet,
              to: tx.to,
              data: tx.data,
              value: tx.value ? BigInt(tx.value) : undefined,
            });
          }
          case "eth_getTransactionReceipt": {
            const [hash] = (params ?? []) as [Hex];
            return pub.getTransactionReceipt({ hash });
          }
          default:
            // Anything else goes to the node. Reads do not need the key.
            return pub.request({ method, params } as never);
        }
      },
      on() {},
      removeListener() {},
    };
  }

  return createConnector((config) => ({
    id: "empowertoursPasskey",
    name: "Passkey",
    type: "passkey" as const,

    // wagmi types connect() with a `withCapabilities` generic this connector does not
    // implement — it returns plain addresses, never capability objects. The cast is narrowing
    // to the shape actually returned, not hiding a mismatch.
    async connect() {
      // Opens the EXISTING wallet. It never creates one: a second credential on this rp id
      // would be a second address for the same person, silently.
      signer = await openSigner();
      const accounts = [signer.account.address] as readonly Address[];
      config.emitter.emit("connect", { accounts, chainId: CHAIN_ID });
      return { accounts, chainId: CHAIN_ID } as never;
    },

    async disconnect() {
      // Ending the session is what zeroes the key. Not optional.
      signer?.session.end();
      signer = null;
      config.emitter.emit("disconnect");
    },

    async getAccounts() {
      if (!signer) throw new Error("Passkey wallet is not connected");
      return [signer.account.address] as readonly Address[];
    },

    async getChainId() {
      return CHAIN_ID;
    },

    async getProvider() {
      if (!signer) throw new Error("Passkey wallet is not connected");
      return providerFor(signer);
    },

    async isAuthorized() {
      // Nothing is persisted, so a reload is never already-authorised. Reconnecting costs one
      // passkey tap, which is the price of a key that never touches disk.
      return signer !== null;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      signer?.session.end();
      signer = null;
    },
  }));
}

/**
 * The same connector, dressed as a RainbowKit wallet.
 *
 * `getDefaultConfig` owns its connector list and will not accept a bare one, so a custom wallet
 * is how RainbowKit takes it. Registering here rather than only as a wagmi connector matters
 * because this app opens the RainbowKit modal in one place and calls `connect()` directly in
 * another (`useWalletContext.connectWallet`) — a connector missing from the modal would work in
 * one and be invisible in the other.
 */
export const passkeyRainbowWallet = () => ({
  id: "empowertours-passkey",
  name: "Passkey",
  iconUrl: async () =>
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="10" cy="8" r="4"/><path d="M10.3 14H10a6 6 0 0 0-6 6v1h9"/><circle cx="17" cy="16" r="3"/><path d="M17 19v3M19 21l-2-2"/></svg>',
    ),
  iconBackground: "#111827",
  // RainbowKit hands `rkDetails` in and expects them merged onto the connector it gets back.
  // `passkeyConnector()` already returns a CreateConnectorFn, so this wraps that function
  // rather than rebuilding the connector — one implementation, two registrations.
  createConnector: (walletDetails: WalletDetailsParams) => {
    const base = passkeyConnector();
    return ((config: Parameters<typeof base>[0]) => ({
      ...base(config),
      ...walletDetails,
    })) as unknown as ReturnType<typeof passkeyConnector>;
  },
});
