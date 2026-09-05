#!/usr/bin/env bash
# Verify a deployed contract on Monad mainnet (chainid 143).
#
#   bash contracts/verify.sh <address> <src/File.sol:Name> [abi-encoded-constructor-args]
#
# ## Why the flags are spelled out rather than left to foundry.toml
#
# The `[etherscan] monad = { key, url }` block in foundry.toml does NOT apply here.
# Two reasons, both verified on 2026-09-05:
#   1. forge does not substitute `${ETHERSCAN_API_KEY}` in that block — `forge config
#      --json` reports the key as the 20-character literal `${ETHERSCAN_API_KEY}`.
#   2. `--chain 143` is not in forge's built-in chain list, so forge errors with
#      "No known Etherscan API URL for chain `143`" before it ever reads the block.
# Supplying --verifier-url sidesteps both. With it, the API authenticates: a bogus
# GUID comes back "Unable to locate guid" rather than a key error.
#
# ## Two deliberate choices about the key
#
# It is read in a SUBSHELL, not by sourcing ../.env into this one. ../.env also holds
# DEPLOYER_PRIVATE_KEY; verification has no use for it, and a plain `. ../.env` would
# export it into the environment forge and every child process inherits. Only the one
# variable crosses back.
#
# It is passed by ENVIRONMENT, not as --etherscan-api-key. A command-line argument is
# visible in `ps` to any other user on the box for as long as the command runs.
# Verified 2026-09-05: forge authenticates from ETHERSCAN_API_KEY alone.
#
# The key is never printed.
set -euo pipefail
cd "$(dirname "$0")"

ADDR="${1:?usage: verify.sh <address> <src/File.sol:Name> [constructor-args]}"
TARGET="${2:?usage: verify.sh <address> <src/File.sol:Name> [constructor-args]}"
ARGS="${3:-}"

KEY=$(set -a; . ../.env >/dev/null 2>&1; printf %s "${ETHERSCAN_API_KEY:-}")
[ -n "$KEY" ] || { echo "ETHERSCAN_API_KEY is not set in ../.env" >&2; exit 1; }

CMD=(forge verify-contract "$ADDR" "$TARGET"
     --verifier etherscan
     --verifier-url "https://api.etherscan.io/v2/api?chainid=143"
     --watch)
[ -n "$ARGS" ] && CMD+=(--constructor-args "$ARGS")

echo "verifying $TARGET at $ADDR on Monad mainnet (143)"
ETHERSCAN_API_KEY="$KEY" "${CMD[@]}"
