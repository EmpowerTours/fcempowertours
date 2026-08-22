"""
Submit the v3 contracts to Etherscan's v2 API for Monad mainnet (chain 143).

Run from `contracts/`:  python3 ../tools/verify-monadscan.py

## Why this exists rather than `forge verify-contract`

Foundry 1.5.1 has no entry for chain 143. `--chain 143` silently falls back to
Sourcify; `--verifier etherscan` ignores `--verifier-url` and looks the chain up in
its own table, which has `monad-testnet` but not mainnet. Nothing gets the chainid
through to the v2 API. Posting the form directly sidesteps all of it — the chainid
is a query parameter we control.

Idempotent: a contract already verified comes back "Already Verified", which is
treated as success.
"""

import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.etherscan.io/v2/api?chainid=143"
COMPILER = "v0.8.30+commit.73712a01"
JSON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "verify-json")

# address, source path as the compiler saw it, contract name, ABI-encoded ctor args (no 0x)
DEPLOYER = "8dF64bACf6b70F7787f8d14429b258B3fF958ec1".lower()
WMON = "3bd359C1119dA7Da1D913D1C4D2B7c461115433A".lower()
TREASURY = "f3b9D123E7Ac8C36FC9B5AB32135c665956725bA".lower()
ORACLE = "e210b31bBDf8B28B28c07D45E9B4FC886aafDCEf".lower()
REWARD_MGR = "056452a44d81AB502e24510b2e4FB1789C6faf85".lower()
REGISTRY = "42EbcD44C2295702130f0A641633c691bA5f9480".lower()
SUBSCRIPTION = "c7EDB67B59B8B89cF4E9bA9bd7b940052563611B".lower()


def word(addr_no_0x: str) -> str:
    return addr_no_0x.rjust(64, "0")


CONTRACTS = [
    (
        "0x42EbcD44C2295702130f0A641633c691bA5f9480",
        "v3/LicenseRegistry.sol",
        "LicenseRegistry",
        word(DEPLOYER),
    ),
    (
        "0xf824D444AAf251EB2197836FFb218d48927F8cB1",
        "v3/SalesController.sol",
        "SalesController",
        word(REGISTRY) + word(WMON) + word(DEPLOYER) + word(TREASURY),
    ),
    (
        "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B",
        "MusicSubscriptionV6.sol",
        "MusicSubscriptionV6",
        word(WMON) + word(REWARD_MGR) + word(REGISTRY) + word(TREASURY) + word(ORACLE),
    ),
    (
        "0xf4C27308f2183E7Cb07c32FAF449a259831E16EC",
        "v3/ProfileRegistry.sol",
        "ProfileRegistry",
        word(DEPLOYER),
    ),
    (
        # Superseded 2026-08-21 — kept because it is already verified and still holds nothing.
        "0x86312a8332a457EbcD3475820AE8AFbcFE032900",
        "PassportNFTV4.sol",
        "PassportNFTV4",
        word(WMON) + word(ORACLE) + word(TREASURY),
    ),
    (
        # The live one. The first V4 shipped without migrateLegacyPassport, so the three
        # existing passports could not have kept their original mint dates.
        "0x4D5533e29Cf190131885Dc7Dbef22e31F4252410",
        "PassportNFTV4.sol",
        "PassportNFTV4",
        word(WMON) + word(ORACLE) + word(TREASURY),
    ),
    (
        "0x5A1c34124eF5b4eC09Bdf0da5b2cbaEE5BE409B3",
        "v3/SubscriptionReferrals.sol",
        "SubscriptionReferrals",
        word(SUBSCRIPTION) + word(WMON) + word(DEPLOYER) + word(TREASURY),
    ),
]


def api_key() -> str:
    """Read the explorer key from foundry.toml. Never printed."""
    with io.open("foundry.toml", encoding="utf-8") as f:
        m = re.search(r'key\s*=\s*"([^"]+)"', f.read())
    if not m:
        sys.exit("no explorer key found in foundry.toml")
    return m.group(1)


def post(fields: dict) -> dict:
    req = urllib.request.Request(
        API,
        data=urllib.parse.urlencode(fields).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return json.load(urllib.request.urlopen(req, timeout=90))


def poll(key: str, guid: str) -> str:
    for _ in range(20):
        q = urllib.parse.urlencode(
            {"module": "contract", "action": "checkverifystatus", "guid": guid, "apikey": key}
        )
        r = json.load(urllib.request.urlopen(f"{API}&{q}", timeout=60))
        result = str(r.get("result"))
        if "Pending" not in result:
            return result
        time.sleep(6)
    return "timed out waiting for the verifier"


def main() -> int:
    key = api_key()
    failures = 0

    for address, path, name, args in CONTRACTS:
        src_path = os.path.join(JSON_DIR, f"{name}.json")
        if not os.path.exists(src_path):
            print(f"  {name:24} SKIP - no standard-json at {src_path}")
            failures += 1
            continue

        with io.open(src_path, encoding="utf-8") as f:
            source = f.read()

        try:
            r = post(
                {
                    "module": "contract",
                    "action": "verifysourcecode",
                    "contractaddress": address,
                    "sourceCode": source,
                    "codeformat": "solidity-standard-json-input",
                    "contractname": f"{path}:{name}",
                    "compilerversion": COMPILER,
                    # Etherscan's own spelling of the parameter. Not a typo here.
                    "constructorArguements": args,
                    "apikey": key,
                }
            )
        except Exception as e:  # noqa: BLE001 - report and continue to the next contract
            print(f"  {name:24} REQUEST FAILED  {e}")
            failures += 1
            continue

        if r.get("status") != "1":
            detail = str(r.get("result"))
            if "already verified" in detail.lower():
                print(f"  {name:24} already verified")
                continue
            print(f"  {name:24} REJECTED  {detail}")
            failures += 1
            continue

        outcome = poll(key, r["result"])
        mark = "OK" if ("Pass" in outcome or "already verified" in outcome.lower()) else "FAILED"
        if mark == "FAILED":
            failures += 1
        print(f"  {name:24} {mark}  {outcome}")
        time.sleep(2)  # the API rate-limits bursts

    print()
    print(
        f"all {len(CONTRACTS)} verified"
        if failures == 0
        else f"{failures} still unverified"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
