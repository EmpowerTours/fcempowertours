/**
 * Find the wallet provider a Farcaster miniapp should send transactions through.
 *
 * ## Why this is a module
 *
 * `useFarcasterContext.sendTransaction` looked for `sdk.ethereum`. That property does not exist.
 * `@farcaster/miniapp-sdk@0.2.1` declares (dist/types.d.ts:68):
 *
 *     wallet: {
 *       ethProvider: Provider.Provider;
 *       getEthereumProvider: () => Promise<Provider.Provider | undefined>;
 *     }
 *
 * so the lookup missed, `window.ethereum` is absent inside the Farcaster webview, and every
 * client-signed transaction threw "No transaction sending method available" — claiming a display
 * name, migrating a catalogue, anything the user signs themselves. Gasless actions go through
 * `/api/execute-delegated` and were unaffected, which is why this went unnoticed.
 *
 * A property name is not something to get wrong twice, and inside a React hook nothing could
 * check it. Here, a fake sdk can.
 */

export interface MiniappWallet {
  getEthereumProvider?: () => Promise<unknown>;
  ethProvider?: unknown;
}

export interface ProviderSource {
  wallet?: MiniappWallet;
}

export type ProviderResult =
  | {
      provider: unknown;
      source: "getEthereumProvider" | "ethProvider" | "window";
    }
  | { provider: null; source: "none"; tried: string[] };

/**
 * @param sdk the miniapp SDK, or anything shaped like it
 * @param windowEthereum `window.ethereum`, for the app opened outside Farcaster
 *
 * Never throws: `getEthereumProvider` rejecting falls through to `ethProvider` rather than taking
 * the transaction with it.
 */
export async function resolveWalletProvider(
  sdk: ProviderSource | null | undefined,
  windowEthereum?: unknown,
): Promise<ProviderResult> {
  const tried: string[] = [];
  const wallet = sdk?.wallet;

  if (typeof wallet?.getEthereumProvider === "function") {
    tried.push("sdk.wallet.getEthereumProvider()");
    try {
      const provider = await wallet.getEthereumProvider();
      if (provider) return { provider, source: "getEthereumProvider" };
    } catch {
      // A rejection here is not fatal — ethProvider below is the same wallet, synchronously.
    }
  }

  if (wallet?.ethProvider) {
    tried.push("sdk.wallet.ethProvider");
    return { provider: wallet.ethProvider, source: "ethProvider" };
  }

  tried.push("window.ethereum");
  if (windowEthereum) return { provider: windowEthereum, source: "window" };

  return { provider: null, source: "none", tried };
}
