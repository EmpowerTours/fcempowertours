"use client";

import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// ⚡ If wagmi doesn’t ship monadTestnet yet, we can define it manually:
export const monad = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] }, // update if different
  },
};

export const config = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: {
    [monad.id]: http(),
  },
});
