/**
 * A deploy script must never read a private key.
 *
 * These scripts used `vm.envUint("DEPLOYER_PRIVATE_KEY")`, which means the key
 * that owns every contract sat in plaintext in .env and was loaded into the
 * environment of any process that ran a deploy -- readable by an npm
 * postinstall, a dependency, a backup, shell history, or an agent running a
 * command on this machine. On 2026-09-03 an API key reached a transcript through
 * a careless grep; the same carelessness aimed at .env would have cost far more
 * than a rate limit.
 *
 * The signer now comes from the command line instead, where it can be an
 * encrypted foundry keystore (--account, unlocked by a passphrase typed at the
 * prompt) or a hardware wallet (--ledger, where the key never leaves the
 * device). Importing a key into a keystore is a human step, done once, outside
 * any agent.
 *
 * `vm.startBroadcast()` with no argument uses whatever forge was given, so the
 * key never enters the process, the repo, or a transcript.
 *
 * Run: npx tsx tools/verify-deploy-signer-from-cli.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "contracts/script");
const failures: string[] = [];
let checks = 0;
let scripts = 0;

checks++;
if (!existsSync(dir)) {
  failures.push("contracts/script is missing — did the deploy scripts move?");
}

const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith(".s.sol"))
  : [];

checks++;
if (files.length === 0) {
  failures.push("found no deploy scripts — this check is not testing anything");
}

for (const f of files) {
  const src = readFileSync(join(dir, f), "utf8");
  const rel = relative(root, join(dir, f));
  // Comments explain the rule; only code is evidence it is followed.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  scripts++;

  checks++;
  if (/vm\.envUint\s*\(\s*"[^"]*PRIVATE_KEY[^"]*"\s*\)/.test(code)) {
    failures.push(
      `${rel} reads a private key from the environment. Use ` +
        "`vm.startBroadcast()` with no argument and pass --account or --ledger, " +
        "so the key never enters the process.",
    );
  }

  checks++;
  // A broadcast taking an argument is a signer chosen inside the script.
  const withArg = [...code.matchAll(/vm\.startBroadcast\(\s*([^)\s][^)]*)\)/g)];
  for (const m of withArg) {
    failures.push(
      `${rel} calls vm.startBroadcast(${m[1].trim()}) — an argument here is a ` +
        "signer chosen inside the script. Leave it empty so forge supplies the " +
        "keystore or hardware wallet given on the command line.",
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${scripts} deploy script(s) take their signer from the CLI — ${checks} checks passed`,
);
