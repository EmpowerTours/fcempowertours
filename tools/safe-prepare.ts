/**
 * Prepare a 2-of-3 Safe transaction: compute the hash, collect the second signature, simulate.
 *
 *   npx tsx tools/safe-prepare.ts --to <address> --sig "acceptGovernance()" [--args a b c]
 *
 * ## What this does and deliberately does not do
 *
 * It does NOT send. It prints the assembled `execTransaction` call for the operator to approve
 * and run through the normal guarded path. A tool that sent would route around the `cast send`
 * gate in `~/.claude/tx-manifest.json`, which exists precisely so no agent can move governance on
 * its own. Preparing is the useful half; approving is not ours to do.
 *
 * ## Why the second key never moves
 *
 * The Safe is 2-of-3. Owner 1 (`0x8dF64bAC…`) is on this machine. Owner 3 (`0xf6A29D21…`) lives
 * at `~/.ayuda/safe-owner3.txt` on the Mac Mini, and `contracts/backup-key.sh` in the ayuda repo
 * explains at length why it must stay there: owner 1 sits in plaintext in three `.env` files
 * here, so a copy of owner 3 on this box means one machine compromise reaches two of three
 * owners, and 2-of-3 stops being worth anything.
 *
 * So the Mac Mini signs the Safe transaction hash and returns **the signature**. A signature
 * authorises exactly one transaction and cannot be replayed into another; a key authorises
 * everything, forever. Moving the first is fine, moving the second is the whole problem.
 *
 * ## Signature encoding, which is easy to get wrong
 *
 * Safe 1.4.1 wants signatures concatenated in ascending owner-address order. Two forms are used:
 *
 *   owner 1  — pre-validated (`v = 1`): 32-byte padded address, 32 zero bytes, then `01`.
 *              Valid only because owner 1 is `msg.sender` of `execTransaction`.
 *   owner 3  — a real ECDSA signature over the safeTxHash, `v` 27/28. `safeTxHash` IS the
 *              EIP-712 digest, so this is a raw `sign(hash)`, NOT `personal_sign` — which would
 *              need `v` 31/32 and a prefixed digest instead.
 *
 * Ascending order here is `0x8dF6…` then `0xf6A2…`, so owner 1's blob comes first. Get that
 * backwards and the Safe reverts GS026 with no hint as to why.
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { execFileSync } from "node:child_process";

const RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://rpc.monad.xyz";
const SAFE = "0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA" as Address;
const OWNER1 = "0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1" as Address;
const OWNER3 = "0xf6A29D21E00D164a7cc895e1913215fF5447A141" as Address;
/** ssh alias; Tailscale was offline, the LAN entry works. */
const MACMINI = process.env.MACMINI_HOST ?? "macmini-lan";

const SAFE_ABI = parseAbi([
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function isOwner(address) view returns (bool)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Ask the Mac Mini to sign this hash. The key never leaves that machine. */
function signOnMacMini(hash: Hex): Hex {
  const script = `
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const txt = fs.readFileSync(process.env.HOME + "/.ayuda/safe-owner3.txt", "utf8");
const pk = (txt.match(/Private key:\\s*(0x[0-9a-fA-F]{64})/) || [])[1];
if (!pk) { console.error("no key"); process.exit(1); }
const acct = privateKeyToAccount(pk);
if (acct.address.toLowerCase() !== "${OWNER3.toLowerCase()}") {
  console.error("key is not owner 3: " + acct.address); process.exit(1);
}
// The safeTxHash is already the EIP-712 digest, so sign it raw (v 27/28).
// signMessage would prefix it and produce a signature the Safe reads as eth_sign (v 31/32).
process.stdout.write(await acct.sign({ hash: "${hash}" }));
`;
  const remote = `cat > ~/ayuda/.safe-sign.mjs <<'SIGEOF'\n${script}\nSIGEOF\ncd ~/ayuda && node .safe-sign.mjs; rm -f ~/ayuda/.safe-sign.mjs`;
  const out = execFileSync(
    "ssh",
    ["-o", "ConnectTimeout=20", MACMINI, remote],
    {
      encoding: "utf8",
      timeout: 120_000,
    },
  ).trim();
  if (!/^0x[0-9a-fA-F]{130}$/.test(out)) {
    throw new Error(
      `Mac Mini did not return a 65-byte signature: ${out.slice(0, 120)}`,
    );
  }
  return out as Hex;
}

/** Owner 1's pre-validated signature — valid only when owner 1 sends execTransaction. */
function preValidated(owner: Address): string {
  return owner.slice(2).toLowerCase().padStart(64, "0") + "0".repeat(64) + "01";
}

async function main() {
  const to = arg("to") as Address | undefined;
  const sig = arg("sig");
  if (!to || !sig) {
    console.error('usage: --to <address> --sig "fn()" [--args a b c]');
    process.exit(1);
  }
  const argsIdx = process.argv.indexOf("--args");
  const callArgs = argsIdx === -1 ? [] : process.argv.slice(argsIdx + 1);

  const client = createPublicClient({ transport: http(RPC) });

  const [nonce, threshold, owners] = await Promise.all([
    client.readContract({
      address: SAFE,
      abi: SAFE_ABI,
      functionName: "nonce",
    }),
    client.readContract({
      address: SAFE,
      abi: SAFE_ABI,
      functionName: "getThreshold",
    }),
    client.readContract({
      address: SAFE,
      abi: SAFE_ABI,
      functionName: "getOwners",
    }),
  ]);

  console.log(`Safe        ${SAFE}`);
  console.log(
    `threshold   ${threshold} of ${(owners as readonly Address[]).length}`,
  );
  console.log(`nonce       ${nonce}`);

  if (Number(threshold) !== 2) {
    console.error(
      `\nThis tool assembles exactly 2 signatures; threshold is ${threshold}. Stop.`,
    );
    process.exit(1);
  }

  // `parseAbi` infers its type from a LITERAL, so a template string gives it nothing to infer
  // from and it resolves to `never`. The signature here is a runtime argument by design, so the
  // ABI is genuinely only knowable at runtime — cast to the runtime `Abi` type rather than
  // pretending the shape is known. tsconfig.tools.json is what surfaced this; tsconfig.json
  // excludes tools/, so this file had never been typechecked.
  const fnAbi = parseAbi([
    `function ${sig}`,
  ] as unknown as readonly string[]) as Abi;
  const data = encodeFunctionData({
    abi: fnAbi,
    args: callArgs.length ? callArgs : undefined,
  });
  console.log(`\ntarget      ${to}`);
  console.log(
    `call        ${sig}${callArgs.length ? ` ${callArgs.join(" ")}` : ""}`,
  );
  console.log(`calldata    ${data}`);

  const safeTxHash = (await client.readContract({
    address: SAFE,
    abi: SAFE_ABI,
    functionName: "getTransactionHash",
    args: [
      to,
      0n,
      data,
      0,
      0n,
      0n,
      0n,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      nonce as bigint,
    ],
  })) as Hex;
  console.log(`safeTxHash  ${safeTxHash}`);

  console.log(`\nAsking ${MACMINI} to sign (key stays there)…`);
  const owner3Sig = signOnMacMini(safeTxHash);
  console.log(
    `owner3 sig  ${owner3Sig.slice(0, 22)}… (${owner3Sig.length - 2} hex chars)`,
  );

  // Ascending owner-address order: 0x8dF6… before 0xf6A2…
  const signatures = ("0x" + preValidated(OWNER1) + owner3Sig.slice(2)) as Hex;

  const execData = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      to,
      0n,
      data,
      0,
      0n,
      0n,
      0n,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      signatures,
    ],
  });

  console.log(`\nSimulating execTransaction from owner 1…`);
  try {
    const { result } = await client.simulateContract({
      address: SAFE,
      abi: SAFE_ABI,
      functionName: "execTransaction",
      args: [
        to,
        0n,
        data,
        0,
        0n,
        0n,
        0n,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        signatures,
      ],
      account: OWNER1,
    });
    console.log(`  simulation OK — execTransaction returns ${result}`);
  } catch (e) {
    console.error(
      `  SIMULATION FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`,
    );
    console.error(
      `  Not printing a send command for a call that does not simulate.`,
    );
    process.exit(1);
  }

  console.log(
    `\n--- To execute, add this to ~/.claude/tx-manifest.json "approved": ---\n`,
  );
  console.log(
    JSON.stringify(
      {
        approved: true,
        to: SAFE,
        sig: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
        args: ["<see calldata below>"],
        note: `Safe 2-of-3: ${sig} on ${to}`,
        expires: new Date(Date.now() + 86400_000)
          .toISOString()
          .replace(/\.\d+Z$/, "Z"),
      },
      null,
      2,
    ),
  );
  console.log(`\n--- then send raw calldata from owner 1 (${OWNER1}): ---\n`);
  console.log(`  to:   ${SAFE}`);
  console.log(`  data: ${execData}`);
  console.log(
    `\nSafe nonce ${nonce} is baked into the signature. If anything else executes`,
  );
  console.log(
    `through the Safe first, this becomes invalid and must be regenerated.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
