import { config } from "dotenv";
config();

import { createPublicClient, http, parseUnits, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { defineChain } from 'viem';
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { entryPoint07Address } from "viem/account-abstraction";
import { writeFileSync } from "fs";

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

const privateKey = (process.env.PRIVATE_KEY as Hex) ?? (() => {
  const pk = generatePrivateKey();
  writeFileSync(".env", `PRIVATE_KEY=${pk}\n`, { flag: 'a' });
  return pk;
})();

const publicClient = createPublicClient({
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

(async () => {
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [privateKeyToAccount(privateKey)],
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    version: "1.4.1",
    singletonAddress: getAddress("0x41675c099f32341bf84bfc5382af534df5c7461a"),
    safe4337ModuleAddress: getAddress("0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226"),
    safeProxyFactoryAddress: getAddress("0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67"),
    multiSendAddress: getAddress("0x38869bf66a61cf6bdb996a6ae40d5853fd43b526"),
    multiSendCallOnlyAddress: getAddress("0x9641d764fc13c8b624c04430c7356c1c7c8102e2"),
  });

  console.log(`Smart account address: https://testnet.monadexplorer.com/address/${account.address}`);

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

  // First, deploy the account with a no-value transaction if not deployed
  try {
    const deployHash = await smartAccountClient.sendTransaction({
      to: account.address, // Send to self
      value: 0n,
      data: "0x",
    });
    console.log(`Deployment transaction hash: https://testnet.monadexplorer.com/tx/${deployHash}`);
  } catch (error) {
    console.error("Error deploying account:", error);
  }

  // Then, fund the account with >1 MON via faucet

  // Finally, send 1 MON
  try {
    const txHash = await smartAccountClient.sendTransaction({
      to: "0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9",
      value: parseUnits("1", 18), // 1 MON
      data: "0x", // Empty data for native token transfer
    });
    console.log(`Transaction hash: https://testnet.monadexplorer.com/tx/${txHash}`);
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
})();
