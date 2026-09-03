/**
 * The SaleOrder signed in the app must match the one the contract hashes.
 *
 * `_consumeSignature` hashes the struct positionally against SALE_TYPEHASH. A
 * field in the wrong order, a wrong type, or a different EIP-712 domain reverts
 * as `BadSignature` — which says nothing about which field was wrong, and looks
 * identical to a forged signature. The same trap as the mint request, which is
 * why that has its own pinning check.
 *
 * Compares lib/sale-order.ts against contracts/v3/SalesController.sol.
 *
 * Run: npx tsx tools/verify-sale-order.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const ts = readFileSync(join(root, "lib/sale-order.ts"), "utf8");
const sol = readFileSync(
  join(root, "contracts/v3/SalesController.sol"),
  "utf8",
);

// --- the typehash string, field for field ------------------------------------
checks++;
const typehash = /SALE_TYPEHASH\s*=\s*keccak256\(\s*"([^"]+)"/s.exec(sol);
if (!typehash) {
  failures.push("could not find SALE_TYPEHASH in SalesController.sol");
} else {
  const inner = /SaleOrder\(([^)]*)\)/.exec(typehash[1]);
  const solFields = (inner?.[1] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => {
      const [type, name] = f.split(/\s+/);
      return { name, type };
    });

  const tsBlock =
    /SALE_ORDER_TYPES\s*=\s*\{[\s\S]*?SaleOrder:\s*\[([\s\S]*?)\]/.exec(ts);
  const tsFields = [
    ...(tsBlock?.[1] ?? "").matchAll(
      /\{\s*name:\s*"(\w+)",\s*type:\s*"(\w+)"\s*\}/g,
    ),
  ].map((m) => ({ name: m[1], type: m[2] }));

  checks++;
  const solSig = solFields.map((f) => `${f.type} ${f.name}`).join(", ");
  const tsSig = tsFields.map((f) => `${f.type} ${f.name}`).join(", ");
  if (solSig !== tsSig) {
    failures.push(
      `SaleOrder fields disagree.\n      Solidity:   ${solSig}\n      TypeScript: ${tsSig}\n` +
        "      Positional hashing means a mismatch reverts as BadSignature with " +
        "no indication of which field is wrong.",
    );
  }

  checks++;
  if (solFields.length === 0) {
    failures.push(
      "parsed zero fields out of SALE_TYPEHASH — the check is inert",
    );
  }
}

// --- the EIP-712 domain ------------------------------------------------------
checks++;
const domain = /EIP712\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/.exec(sol);
if (!domain) {
  failures.push("could not find the EIP712 domain in SalesController.sol");
} else {
  checks++;
  const nameOk = new RegExp(`SALE_DOMAIN_NAME\\s*=\\s*"${domain[1]}"`).test(ts);
  const versionOk = new RegExp(
    `SALE_DOMAIN_VERSION\\s*=\\s*"${domain[2]}"`,
  ).test(ts);
  if (!nameOk || !versionOk) {
    failures.push(
      `EIP-712 domain disagrees — Solidity has ("${domain[1]}", "${domain[2]}"); ` +
        "lib/sale-order.ts must declare the same name and version or every " +
        "signature fails verification",
    );
  }
}

// --- the struct the ABI encodes ----------------------------------------------
checks++;
const structDecl = /struct\s+SaleOrder\s*\{([^}]*)\}/s.exec(sol);
if (!structDecl) {
  failures.push("could not find `struct SaleOrder` in SalesController.sol");
} else {
  const order = structDecl[1]
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0]);
  checks++;
  // The tuple in the executeSale ABI string must list the same types in order.
  const abiTuple = /executeSale\(\(([^)]*)\)/.exec(ts);
  const abiTypes = (abiTuple?.[1] ?? "")
    .split(",")
    .map((f) => f.trim().split(/\s+/)[0])
    .filter(Boolean);
  if (order.join(",") !== abiTypes.join(",")) {
    failures.push(
      `executeSale's tuple disagrees with struct SaleOrder — Solidity ` +
        `(${order.join(", ")}), TypeScript ABI (${abiTypes.join(", ")})`,
    );
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ SaleOrder matches the contract — ${checks} checks passed`);
