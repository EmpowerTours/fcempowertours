<!-- Delete any section that does not apply. Guide: AGENTS.md -->

## What

<!-- One paragraph: what this changes and why. Name the bug or the goal, not the files. -->

## Evidence it works

<!-- Not "it should work". What did you run, and what did it print?
     Logs, then chain, then DB, then code — code explains behaviour, it never proves it. -->

<details>
<summary><code>.claude/verify.sh</code> output</summary>

```
(paste the last ~15 lines, including the "ALL CHECKS PASSED (N checks ran)" line)
```

</details>

## Checklist

- [ ] `.claude/verify.sh` green — **and `N checks ran` is not 0**
- [ ] New behaviour that could regress silently has a `tools/verify-<thing>.ts` invariant
      (glob-discovered; no registration needed)
- [ ] I made at least one new check **fail on purpose once**, so I know it can
- [ ] No `NEXT_PUBLIC_*` used to decide behaviour the server is the authority on
      (build-time vs runtime — ask `/api/config-check`; see AGENTS.md)
- [ ] No private RPC or secret referenced from code that reaches the browser
- [ ] Prettier-only reformatting is a **separate, earlier commit**

### If it touches money or an amount shown to a user

- [ ] The split/fee is **read from the chain**, not hardcoded (`lib/artist-cut.ts`)
- [ ] One real example hand-verified — paste the tx and the arithmetic:

  ```
  tx:
  on-chain value:
  what the app shows:
  ```

- [ ] If it implies a payout: the payout is **pull, not push** — the UI does not suggest
      money will arrive on its own (`lib/artist-claim.ts`)
- [ ] Points/reward maths still has exactly one source (`lib/listener-points.ts`), and any
      governable contract value is read rather than assumed

### If it touches contracts

- [ ] `forge test` green, and the test count went up or the change is provably not new behaviour
- [ ] Chain id is 143 everywhere it is named
- [ ] Gas limits account for Monad charging the **full limit** (a Safe transfer needs ~62k)
