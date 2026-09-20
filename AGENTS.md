# Agent guide — fcempowertours

Farcaster miniapp + web app for EmpowerTours: artists mint and sell art, music and travel
NFTs on **Monad mainnet (chain 143)**. Next.js 15 App Router, React 18.3.1, TypeScript
strict, Node ≥ 20, npm. `app/` is routes + API handlers, `lib/` is shared logic and ABIs,
`contracts/` is Solidity built with Foundry.

The app runs in two places at once — inside a Farcaster client and in a plain browser — and
most of the sharp edges below come from that, or from money maths that must agree with a
deployed contract.

## Commands

```bash
npm run dev          # next dev on 0.0.0.0
npm run typecheck    # tsc --noEmit — run after every change
npm run lint         # eslint; errors block a commit, warnings do not
npm run build        # next build + copies static/ and public/ into .next/standalone
npm start            # runs the standalone server (PORT, default 8080)
npm run test:e2e     # boots the app + chromium; E2E_BASE_URL reuses a running one
forge test           # contracts/ — foundry.toml sets src = "contracts"

.claude/verify.sh                          # THE GATE. Non-zero exit = not done.
VERIFY_SKIP_BUILD=0 VERIFY_SKIP_E2E=0 .claude/verify.sh   # what the commit gate runs
npx tsx tools/verify-<name>.ts             # one invariant on its own
npx tsc --noEmit -p tsconfig.tools.json    # typecheck tools/ (root tsconfig excludes it)
```

`verify.sh` is the definition of "working" here: forge build + tests, typecheck, lint, build,
the browser checks, the deploy-artifact check, the tools/ typecheck, all 49 repo invariants,
then repo-safety checks. Never weaken a check to make it pass.

**Two steps are off by default and that is deliberate.** `.claude/verify.conf` sets
`VERIFY_SKIP_BUILD=1` and `VERIFY_SKIP_E2E=1` so the in-session stop-gate stays fast (~45s
instead of ~9min); the commit gate runs both with `=0`. In the fast mode the gate has not
built the app and has not opened a page — do not report "verify green" as proof of either.
A full run is **60 checks**.

**`npm run build`'s two `cp` steps are load-bearing.** `next build` alone produces a
`standalone/` tree with no static assets and no `public/`, so the Railway deploy serves a
site with no CSS and no images. Never "simplify" the build script to just `next build`.

## What typecheck does and does not cover

`tsconfig.json` excludes `contracts`, `scripts`, `tools`, `discord-bot`,
`mon-rescue-service` and `monad-trading-bot`. Code you add under any of those is **not**
typechecked by `npm run typecheck` or by the pre-commit hook. If you put logic there,
either give it its own tsconfig and check it explicitly, or accept that nothing is
watching it.

There is no `npm test` script, but the repo is **not** untested. `.claude/verify.sh` runs
267 Foundry tests plus **48 `tools/verify-*.ts` repo invariants**, each one encoding a bug
that actually shipped — read a few headers (`verify-play-ledger.ts`,
`verify-payout-splits-come-from-chain.ts`, `verify-wmon-fees-wrap-shortfall.ts`) before
assuming a rule is arbitrary. Discovery is a glob, so **a new `tools/verify-<thing>.ts` is
live the moment you add it** — nobody has to register it.

When you fix a bug that could recur silently, the house style is to add an invariant there
rather than only fixing the line.

Two checks are a different kind and worth knowing about:

- **`tools/verify-monthly-stats-decode.ts`** decodes REAL recorded chain bytes
  (`tools/fixtures/subscription-month-stats.json`, mainnet block 106510529) offline — the only
  check that can catch our code being internally consistent and still disagreeing with the
  contract. Its key assertion is that `monthlyStats(uint256)` still returns **exactly four
  words**: three live routes decode that tuple by position, and `MusicSubscriptionV6.sol:165`
  says widening the struct "would silently shift what they read". viem decodes a five-word
  return without complaint, so nothing else notices.
- **`tools/e2e/run.ts`** (`npm run test:e2e`) boots the app and drives chromium. It asserts
  four things that are wrong on any page, forever: a raw wei value shown to a human, a page
  with no stylesheet, a page that threw instead of rendering, and a manifest naming a host
  that did not serve it. Deliberately content-agnostic — it does not encode what a page should
  say, because that changes weekly and a test nobody can keep true gets deleted.

If you add a browser check, wait for the page to **settle** (`settledText`) — never a fixed
delay, and never "first content". The SSR shell satisfies a length check on the first paint
and hydration then replaces it: `/profile` shows its nav, drops to "Loading your profile…",
and only reaches its connect prompt around six seconds in.

## Money maths — the rules that must match a deployed contract

- **The artist's share is read from the chain, never hardcoded.** `lib/artist-cut.ts`
  computes `price - price * treasuryFeeBps / 10_000` against the live `SalesController`.
  The deployed `treasuryFeeBps` is 1000, i.e. **the artist gets 90%**. Two API routes once
  hardcoded 70% and told artists they had earned 0.7 WMON on a sale that paid them 0.9.
  Use `artistCutOf()`; do not reintroduce a literal.
- **Payouts are PULL, not push.** `lib/artist-claim.ts` — the artist calls
  `claimArtistPayout(monthId)` / `batchClaimArtistPayouts(monthIds)` from their own wallet
  against MusicSubscription. Nothing in this app sends an artist their money; a UI that
  implies otherwise is lying about what will happen.
- **Listener point maths lives in exactly one file.** `lib/listener-points.ts` is shared by
  `app/api/cron/distribute-listener-rewards` (which writes points on-chain) and
  `app/api/listener-earnings` (which shows the user an estimate). If they drift, the app
  promises a payout the chain will not honour. `RESERVE_PERCENTAGE` became **governable on
  MusicSubscriptionV6**, so the `20n` in that file is a last-resort fallback — read
  `RESERVE_PERCENTAGE()` from the contract and pass it in.
- Anything touching a number a user will be paid: hand-verify one real example against the
  chain or the explorer before claiming it works. Decimals and bps are where these bugs
  live.

## Client / server split — the traps

- **A browser module must use the keyless public RPC** (`https://rpc.monad.xyz`), as
  `lib/artist-claim.ts` does. Referencing the private RPC from code that reaches the client
  ships its key in the bundle.
- **`NEXT_PUBLIC_*` is inlined at BUILD time on the client and read at RUNTIME on the
  server, so the two can disagree.** They did: `config-check` reported `contractsV3: true`
  while the browser skipped signing the MintRequest, and every collector mint failed with
  "mintRequest must be an object" — correct code on both sides, disagreeing about which
  contracts were live. When the answer decides behaviour, **ask the server**
  (`lib/contracts-v3-client.ts` → `/api/config-check`), and fail closed.
- By definition every `NEXT_PUBLIC_` value is public. `NEXT_PUBLIC_NEYNAR_API_KEY` is in
  the client bundle — that is a known exposure, not a thing to "fix" by renaming it while
  leaving the client code that reads it.
- **viem only batches when the chain declares Multicall3.** `app/chains.ts` declares it at
  the canonical address (verified live on Monad mainnet). Without that entry
  `client.multicall(...)` silently degrades to one request per call — reading five masters
  cost ~30 sequential round trips. If reads feel slow, check this before blaming the RPC.

## Feature flags that change what the code means

- **`NEXT_PUBLIC_USE_USER_SAFES`** (`lib/safe-mode.ts`) switches between user-funded and
  platform-funded Safes. It changes which address pays and which Safe mints; read
  `USE_USER_SAFES` rather than assuming either mode.
- **`ENFORCE_QUICK_AUTH` is advisory until it is `"true"`.** `lib/quick-auth.ts` verifies
  the token and, while the flag is off, **logs failures and lets them through**. Do not
  describe an endpoint as authenticated on the strength of a Quick Auth call alone. One
  exception is already coded: `execute-delegated` rejects a mismatched `userAddress`
  regardless of the flag, because that check protects funds.

## Farcaster manifest

`app/.well-known/farcaster.json/route.ts` serves the manifest **for the host it was
requested on**, picking the `accountAssociation` with `associationForHost()`. The signature
is bound to one domain and Farcaster reads `homeUrl` from the manifest it fetched, so a
hardcoded origin breaks either the Railway domain or the custom domain during a cutover.
An unsigned host logs a warning and serves a manifest that will not validate there.

## Commit hooks (`.husky/`)

- **pre-commit**: scans the staged diff for a hardcoded key — a 64-hex literal fails unless
  a nearby line names it as a hash/digest/root, because a key and a keccak digest are the
  same shape and a gate that cries wolf gets bypassed. Then `tsc --noEmit` on staged TS,
  then eslint (**errors block, warnings do not** — 82 warnings remain, mostly
  `no-img-element`), then a >1MB file warning.
- **commit-msg**: rejects an AI `Co-Authored-By:` line; first line ≤ 100 chars.
- Known dead code: the pre-commit hook still has an `empowertours-envio/` typecheck block.
  **Envio was removed** and that directory no longer exists, so the block never fires. All
  chain reads are direct RPC now — if you find code expecting an indexer, it is stale.
- This repo's convention is to **commit a prettier reformat separately, first**, so a
  behavioural diff is readable.

## Conventions

- **Comments explain the constraint, not the code.** Most non-trivial files here open with
  a "why it is this way" header naming the bug that produced the rule (see
  `lib/artist-cut.ts`, `lib/listener-points.ts`, `lib/contracts-v3-client.ts`). Match that
  density and voice; a comment restating the next line is noise.
- Log with a `[ModuleName]` prefix.
- viem is preferred over ethers for new code.
- Monad specifics that bite: the chain charges the full **gas limit**, so a transfer from a
  Safe needs ~62k, not 21k — a 21k limit reverts *and* is charged in full.

## Verification bar

"Done" means demonstrated: `.claude/verify.sh` green, plus the change actually exercised —
and for anything that moves money or displays an amount, one real example checked by hand
against the chain or the explorer.

Know what the green does *not* cover. The invariants are static checks over source, and
nothing here renders a page, so a number that is computed correctly and then displayed
wrongly still passes everything. If your change is visible, look at it.
