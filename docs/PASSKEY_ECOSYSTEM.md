# One passkey, one wallet, across EmpowerTours

A Mera passkey wallet is a pure function of `(credential, rpId, PRF salt)`, run through
BIP-39 → `m/44'/60'/0'/0/0`. Two apps derive the **same address** from the same passkey only if
they use the **same rpId AND the same salt**. Change either and the same face opens a
different, empty wallet with no error.

## The shared constants (already in production)

| Input | Value | Where pinned |
|---|---|---|
| rpId | `empowertours.xyz` (registrable parent) | `lib/passkey/derive.ts`, `lib/passkey/rp-id.ts` |
| PRF salt | `sha256("empowertours-hunt/passkey/v1")` = `0x9fc345ce…0f648f` | `lib/passkey/derive.ts` |
| Path | `m/44'/60'/0'/0/0` | `lib/passkey/derive.ts` |
| Credential hint cookie | `et.passkey.credential`, `domain=empowertours.xyz` | `lib/passkey/credential-hint.ts` |

The salt label says "hunt" for history only: Hunt has been issuing wallets under these bytes
with `NEXT_PUBLIC_RP_ID=empowertours.xyz`, and the art app already derives with the same pair.
**Adopting a new "tidier" label (e.g. `empowertours/passkey/v1`) would fork every existing Hunt
and art wallet**, and Hunt is frozen until Nov 3, so it cannot follow. The ecosystem salt is
therefore Hunt's label, unchanged. Future apps (Rumbo, Cota, …) adopt it as-is.

`tools/verify-passkey-derivation.ts` pins all of this and cross-checks Hunt's source when the
repo sits beside this one. `tools/verify-passkey-signin.ts` pins the rpId setting and proves a
passkey signature goes through the ordinary `authorizeUserAddress` path.

### rpId setting

`NEXT_PUBLIC_PASSKEY_RP_ID` defaults to `empowertours.xyz`. It accepts only `empowertours.xyz`
or `localhost` (for local development, a throwaway wallet). Everything else is refused at the
first ceremony. The salt is not a setting.

### Why no related-origin requests are needed

WebAuthn lets a page use an rpId equal to its host or any registrable suffix of it. Pages on
`art.empowertours.xyz`, `empowertours.xyz`, `rumbo.empowertours.xyz`, `hunt.empowertours.xyz`
can all use rpId `empowertours.xyz` directly. Related Origin Requests
(`/.well-known/webauthn`) are only needed for a **different** registrable domain (e.g. a Railway
`*.up.railway.app` URL, or a future `.mx` domain). The Railway URL therefore cannot open the
passkey wallet; the dialog tells the user to use the custom domain.

## Browser / host support caveats

- **PRF is required.** Mera refuses (`PRF_UNAVAILABLE`) without it. Supported: Chrome/Edge
  desktop and Android (Google Password Manager passkeys, recent versions), Safari 18+ on
  iOS/iPadOS 18+ and macOS 15+ with iCloud Keychain. Firefox support is newer and depends on
  the authenticator. Some hardware keys and third-party password managers do not evaluate PRF.
- **In-app browsers / Farcaster webviews:** WebAuthn and especially PRF are not reliably
  exposed inside the Warpcast/Farcaster webview or other embedded webviews. The art app keeps
  the Farcaster wallet there; the passkey dialog is only reachable outside Farcaster (the
  `requestWallet` Farcaster early-return comes first). A Farcaster user who wants the same
  passkey wallet opens art.empowertours.xyz in Safari/Chrome.
- `PublicKeyCredential.getClientCapabilities()` is used as a hint only; an explicit
  `extension:prf: false` hides the passkey buttons, otherwise the ceremony decides.

## How the art app uses it

`lib/passkey/connector.ts` is a wagmi connector (also a RainbowKit wallet). Once connected, the
passkey address is just `useAccount().address`: `personal_sign` and `eth_signTypedData_v4` are
mera's account, so wallet-auth headers, `authorizeUserAddress`, the per-user Safe (owned by this
EOA), Pimlico sponsorship and the `x-delegation-session` binding all work unchanged.

`app/components/PasskeySignInDialog.tsx` (EN/ES) offers **Create my wallet** / **I already have a
wallet** and **Use another wallet** (RainbowKit). Opening never falls back to creating.

## Rumbo: the change needed to join (NOT applied yet)

Rumbo (`tours-loop/ui/src/auth/`) currently uses rpId `location.hostname`
(= `rumbo.empowertours.xyz`) and salt `empowertours-rumbo/passkey/v1`, so its wallets differ
from art/Hunt. It is testnet-only and days old, so switching now is cheap; after mainnet it
would strand balances.

1. `derive.js`: `TOURS_PRF_SALT_LABEL = 'empowertours-hunt/passkey/v1'` (keep the export name or
   rename to `EMPOWERTOURS_PRF_SALT_LABEL`; the **label value** is what matters).
2. `passkey.js`: `RP_ID = import.meta.env.VITE_RP_ID || 'empowertours.xyz'` (not
   `location.hostname`); allow only `empowertours.xyz` / `localhost`.
3. `passkey.js`: `EXPECTED_SALT_LABEL = 'empowertours-hunt/passkey/v1'` so the parent-rpId guard
   passes; keep `FOREIGN_RP_IDS` (those are subdomain rpIds and stay refused).
4. Remember the credential id in the shared cookie `et.passkey.credential` with
   `domain=empowertours.xyz` (same JSON `{credentialId, transports}` as Hunt/art).
5. `derive.test.mjs`: pin the label and the salt digest (sha256 hash of the public label, not a key)
   `0x9fc345cea9c77d56f4238d9940dfdc757b6a69fb1d83893e067cefbeda0f648f`.
6. **Vault salt:** `empowertours-rumbo/passkey/vault/v1` can stay Rumbo-specific (it seals
   Rumbo's own secrets, not the wallet), but under the shared rpId any app can evaluate it.
   Hunt's equivalent is `empowertours-hunt/passkey/vault/v1`; pick deliberately.
7. Existing testnet Rumbo passkeys (rpId `rumbo.empowertours.xyz`) will not be offered under
   the new rpId at all; testers create a new passkey (or use "I already have a wallet" with
   their Hunt/art one). Testnet balances on the old addresses are abandoned or swept first.
8. Set `VITE_RP_ID=empowertours.xyz` on Railway `rumbo-web` (or leave unset with the new default).
