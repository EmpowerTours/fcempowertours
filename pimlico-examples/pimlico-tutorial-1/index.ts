import 'dotenv/config';
import { createPublicClient, http, Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { writeFileSync } from "fs";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { defineChain } from "viem";

// Define Monad Testnet chain (since it's not predefined in viem)
const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
});

const apiKey = process.env.PIMLICO_API_KEY;
if (!apiKey) throw new Error("Missing PIMLICO_API_KEY");

const privateKey =
  (process.env.PRIVATE_KEY as Hex) ??
  (() => {
    const pk = generatePrivateKey();
    writeFileSync(".env", `PRIVATE_KEY=${pk}\n`, { flag: 'a' }); // Append to .env
    return pk;
  })();

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=${apiKey}`;

const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
});

// Step 2: Create the SmartAccount instance (this prints the address)
const account = await toSafeSmartAccount({
  client: publicClient,
  owners: [privateKeyToAccount(privateKey)],
  entryPoint: {
    address: entryPoint07Address,
    version: "0.7",
  },
  version: "1.4.1",
});

console.log(`Smart account address: https://testnet.monadexplorer.com/address/${account.address}`);

// Step 3: Create bundler and smart account clients
const smartAccountClient = createSmartAccountClient({
  account,
  chain: monadTestnet,
  bundlerTransport: http(pimlicoUrl),
  paymaster: pimlicoClient,
  userOperation: {
    estimateFeesPerGas: async () => {
      return (await pimlicoClient.getUserOperationGasPrice()).fast;
    },
  },
});

// Step 4: Submit a transaction (optional; remove if you just want the address)
const txHash = await smartAccountClient.sendTransaction({
  to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", // Example recipient
  value: 0n,
  data: "0x1234",
});

console.log(`User operation included: https://testnet.monadexplorer.com/tx/${txHash}`);
