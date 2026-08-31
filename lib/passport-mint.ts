/**
 * The two things that must be true before a passport mint can succeed, and the calls that make
 * one work.
 *
 * ## Why this exists
 *
 * A passport mint reverted with nothing useful to show for it. Two separate misconfigurations sat
 * in front of it, and from outside the contract they were indistinguishable — both surfaced as
 * "Mint transaction reverted", after the gas was spent.
 *
 *   1. **`Not authorized to mint`.** `mintFor` is `onlyAuthorizedMinter`, which is
 *      `authorizedMinters[msg.sender] || msg.sender == owner()`. The app mints through the
 *      Platform Safe, and the Safe was never added after the V4 redeploy. `platformOperator` WAS
 *      set, which is a different mapping and grants nothing here — an easy thing to check, see
 *      set, and believe you are done.
 *
 *   2. **No WMON allowance.** `_mintPassport` ends with
 *      `wmonToken.safeTransferFrom(msg.sender, platformWallet, MINT_PRICE)`. The Safe holds
 *      plenty; its allowance to the passport contract was zero. `platformWallet` is the Safe
 *      itself, so the transfer is a no-op in balance terms — and still needs the approval,
 *      because it goes through `transferFrom`.
 *
 * Neither had ever been hit, because every passport on the live contract arrived through
 * `migrateLegacyPassport`, which bypasses payment entirely. The first real mint found both.
 *
 * ## Read, never assume
 *
 * `MINT_PRICE` is read from the contract rather than written here. It is 150 WMON today. A
 * constant copied into the app is a number that goes stale silently — it would approve too little
 * and revert, or too much and leave a standing allowance nobody meant to grant.
 */

import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

const PASSPORT_ABI = parseAbi([
  "function MINT_PRICE() view returns (uint256)",
  "function wmonToken() view returns (address)",
  "function authorizedMinters(address) view returns (bool)",
  "function owner() view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export type PassportMintPreflight =
  | {
      ok: true;
      wmon: Address;
      mintPrice: bigint;
      allowance: bigint;
      balance: bigint;
    }
  | { ok: false; reason: string; fix: string };

/**
 * Can this sender mint right now?
 *
 * Fails closed and says which condition is unmet, because the whole point is to replace a revert
 * that named nothing.
 */
export async function preflightPassportMint(
  client: PublicClient,
  opts: { passport: Address; sender: Address },
): Promise<PassportMintPreflight> {
  const { passport, sender } = opts;

  let mintPrice: bigint;
  let wmon: Address;
  let authorized: boolean;
  let owner: Address;

  try {
    const [priceRes, wmonRes, authRes, ownerRes] = await Promise.all([
      client.readContract({
        address: passport,
        abi: PASSPORT_ABI,
        functionName: "MINT_PRICE",
      }),
      client.readContract({
        address: passport,
        abi: PASSPORT_ABI,
        functionName: "wmonToken",
      }),
      client.readContract({
        address: passport,
        abi: PASSPORT_ABI,
        functionName: "authorizedMinters",
        args: [sender],
      }),
      client.readContract({
        address: passport,
        abi: PASSPORT_ABI,
        functionName: "owner",
      }),
    ]);
    mintPrice = priceRes as bigint;
    wmon = wmonRes as Address;
    authorized = authRes as boolean;
    owner = ownerRes as Address;
  } catch (e) {
    return {
      ok: false,
      reason: "Could not read the passport contract",
      fix: `Check NEXT_PUBLIC_PASSPORT_NFT points at a live PassportNFTV4. ${(e as Error).message}`,
    };
  }

  // The modifier's own rule, in the same order: an authorised minter OR the owner.
  if (!authorized && sender.toLowerCase() !== owner.toLowerCase()) {
    return {
      ok: false,
      reason:
        "This deployment cannot mint passports yet — the minter is not authorised.",
      fix:
        `Call setAuthorizedMinter(${sender}, true) on ${passport} from the owner ${owner}. ` +
        `Note that platformOperator is a DIFFERENT mapping and does not grant minting.`,
    };
  }

  const [allowance, balance] = await Promise.all([
    client.readContract({
      address: wmon,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [sender, passport],
    }) as Promise<bigint>,
    client.readContract({
      address: wmon,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [sender],
    }) as Promise<bigint>,
  ]);

  // Balance, not allowance: the allowance is granted in the same batch as the mint below, so its
  // being zero here is the normal case and not a problem. A short balance is.
  if (balance < mintPrice) {
    return {
      ok: false,
      reason: "The minting account cannot cover the passport mint price.",
      fix: `${sender} holds ${balance} of the ${mintPrice} WMON wei required. Top it up.`,
    };
  }

  return { ok: true, wmon, mintPrice, allowance, balance };
}

/**
 * The calls to send, approval included only when it is actually needed.
 *
 * Approves EXACTLY the mint price rather than an unlimited amount: the transfer consumes it in
 * the same batch, so the allowance is back to zero afterwards and no standing permission is left
 * behind on a Safe that holds real funds.
 */
export function buildPassportMintCalls(opts: {
  passport: Address;
  wmon: Address;
  mintPrice: bigint;
  allowance: bigint;
  mintData: Hex;
}): Array<{ to: Address; value: bigint; data: Hex }> {
  const calls: Array<{ to: Address; value: bigint; data: Hex }> = [];

  // A leftover allowance from a batch whose mint reverted is enough on its own; re-approving on
  // top of it would leave the excess sitting there after this mint spends only the price.
  if (opts.allowance < opts.mintPrice) {
    calls.push({
      to: opts.wmon,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [opts.passport, opts.mintPrice],
      }),
    });
  }

  calls.push({ to: opts.passport, value: 0n, data: opts.mintData });
  return calls;
}
