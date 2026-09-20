/**
 * Quick Auth must accept a token from every host we serve a signed manifest for.
 *
 * Run: `npx tsx tools/verify-quickauth-accepts-signed-hosts.ts`
 *
 * ## The bug this encodes
 *
 * A Quick Auth token's `aud` is the domain the mini app was LAUNCHED from. Both hosts in
 * `lib/farcaster-associations.ts` serve a manifest naming themselves as `homeUrl` — deliberately,
 * because an association signature is bound to one domain and neither host would validate
 * otherwise during a cutover. So a client that fetched the old manifest keeps launching there,
 * and keeps minting tokens with the old `aud`.
 *
 * `verifyQuickAuth` checked a single domain. After the cutover to `art.empowertours.xyz`, a
 * collector mint from a client still on the Railway host was refused with
 * `unexpected "aud" claim value` — and `useActionAuth` returns only the Quick Auth token inside
 * Farcaster, with no wallet-signature fallback, so there was no second chance. The mint simply
 * failed, and the error told the user to "reopen the mini app", which could not have helped.
 *
 * The manifest layer was multi-host. The auth layer was not. Nothing compared them.
 *
 * ## Why this check and not a behavioural one
 *
 * Verifying a real token needs a live Farcaster client to mint one, which a stop-gate cannot do.
 * What is checkable offline is the invariant that actually broke: the set of domains the verifier
 * accepts must contain every host the manifest signs for. Add a host to the map and this passes
 * only once auth accepts it too.
 */

import {
  signedHosts,
  associationForHost,
  signedDomain,
} from "../lib/farcaster-associations.ts";
import { acceptedQuickAuthDomains } from "../lib/quick-auth.ts";

const failures: string[] = [];
let checks = 0;

const hosts = signedHosts();

checks++;
if (hosts.length === 0) {
  failures.push(
    "no signed hosts at all — the manifest cannot validate anywhere, which is a different\n" +
      "     and worse problem than this check was written for",
  );
}

/**
 * Every signed host must be accepted. `QUICK_AUTH_DOMAIN` deliberately pins to one host when
 * set, so the check only applies to the default (unset) configuration — pinning is a choice,
 * silently dropping a host is not.
 */
const pinned = process.env.QUICK_AUTH_DOMAIN;
if (!pinned) {
  const accepted = acceptedQuickAuthDomains().map((d) => d.toLowerCase());
  for (const host of hosts) {
    checks++;
    if (!accepted.includes(host)) {
      failures.push(
        `we serve a signed manifest for ${host}, but Quick Auth does not accept tokens\n` +
          `     minted for it. A client launching from that host has its fund-moving actions\n` +
          `     refused with 'unexpected "aud" claim value', and inside Farcaster there is no\n` +
          `     wallet fallback — the action just fails.\n` +
          `     accepted: ${accepted.join(", ") || "(none)"}`,
      );
    }
  }
}

/** Each association's payload must actually name the host it is filed under. */
for (const host of hosts) {
  checks++;
  const { association, matched } = associationForHost(host);
  if (!matched) {
    failures.push(`${host} is listed but associationForHost does not match it`);
    continue;
  }
  const claimed = signedDomain(association);
  if (claimed?.toLowerCase() !== host) {
    failures.push(
      `${host} is filed under that key but its payload is signed for ` +
        `${claimed ?? "(undecodable)"} — the manifest will not validate there`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    "✗ Quick Auth and the manifest disagree about which hosts are ours\n",
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ Quick Auth accepts every signed host (${hosts.join(", ")}) — ${checks} checks passed`,
);
