import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export function getConfig() {
  return createConfig({
    chains: [sepolia],
    connectors: [injected({ shimDisconnect: true })],
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [sepolia.id]: http(),
    },
  });
}
