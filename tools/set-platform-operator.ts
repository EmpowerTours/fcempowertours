/**
 * One-off: point PassportNFTV4.platformOperator at the bot signer.
 *
 * Why this exists: platformOperator was the Platform Safe, a 2-of-3 multisig the
 * server holds one key for, so registerUserSafeAsMinter could never be sent —
 * its EntryPoint nonce is 0, it has never executed a user operation. No user
 * Safe was ever registered, and every paid mint reverted with "Not authorized
 * to mint".
 *
 * platformOperator can do exactly one thing: registerUserSafeAsMinter. A minter
 * can only mint by paying MINT_PRICE from its own balance. The bot signer is
 * already owner() here, which can appoint operators and grant minters outright,
 * so this grants it nothing it does not already hold.
 *
 * Run:  npx tsx tools/set-platform-operator.ts
 * Needs DEPLOYER_PRIVATE_KEY in .env — the key is read, never printed.
 */
import { readFileSync } from "fs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.monad.xyz";
const EXPECTED_CHAIN_ID = 143;

// Defaults to PassportNFTV4, the contract that gates minting. PlayOracle
// (0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf) has the same owner, the same
// platformOperator role and the same stale value, so pass it as an argument to
// fix that one too:
//
//   npx tsx tools/set-platform-operator.ts 0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf
//
// The pre-flight below refuses anything where the signer is not owner(), so a
// wrong address fails before it can spend.
const PASSPORT =
  process.argv[2] || "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410";
if (!/^0x[0-9a-fA-F]{40}$/.test(PASSPORT)) {
  throw new Error(`Not an address: ${PASSPORT}`);
}

const abi = parseAbi([
  "function owner() view returns (address)",
  "function platformOperator() view returns (address)",
  "function setPlatformOperator(address operator) external",
]);

function loadKey() {
  const line = readFileSync(".env", "utf8")
    .split("\n")
    .find((l) => l.startsWith("DEPLOYER_PRIVATE_KEY="));
  if (!line) throw new Error("DEPLOYER_PRIVATE_KEY not in .env");
  const raw = line
    .slice("DEPLOYER_PRIVATE_KEY=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  return raw.startsWith("0x") ? raw : "0x" + raw;
}

const account = privateKeyToAccount(loadKey());
const chain = {
  id: EXPECTED_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

// --- Pre-flight. Every one of these must hold before anything is spent. ---
const chainId = await pub.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Wrong chain: ${chainId}, expected ${EXPECTED_CHAIN_ID}`);
}

const owner = await pub.readContract({ address: PASSPORT, abi, functionName: "owner" });
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`Signer ${account.address} is not owner() ${owner}`);
}

const before = await pub.readContract({
  address: PASSPORT,
  abi,
  functionName: "platformOperator",
});

console.log("chain:            ", chainId);
console.log("contract:         ", PASSPORT);
console.log("signer (= owner): ", account.address);
console.log("operator before:  ", before);
console.log("operator after:   ", account.address);

if (before.toLowerCase() === account.address.toLowerCase()) {
  console.log("\nAlready set. Nothing to do.");
  process.exit(0);
}

// Simulate before sending: a revert here costs nothing, on-chain it costs gas.
const { request } = await pub.simulateContract({
  account,
  address: PASSPORT,
  abi,
  functionName: "setPlatformOperator",
  args: [account.address],
});

const hash = await wallet.writeContract(request);
console.log("\ntx sent:", hash);

const receipt = await pub.waitForTransactionReceipt({ hash });
console.log("status: ", receipt.status);
console.log("block:  ", receipt.blockNumber);

const after = await pub.readContract({
  address: PASSPORT,
  abi,
  functionName: "platformOperator",
});
console.log("\nplatformOperator now:", after);
console.log(
  "VERIFIED:",
  after.toLowerCase() === account.address.toLowerCase() ? "YES" : "NO",
);
