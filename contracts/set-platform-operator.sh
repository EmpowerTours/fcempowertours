#!/usr/bin/env bash
#
# Set PassportNFTV4.platformOperator to the platform Safe.
#
# Run: ./contracts/set-platform-operator.sh
#
# ## Why this exists
#
# The v3 cutover redeployed PassportNFTV4 to 0x4D5533e2… and never called this setter, so
# `platformOperator` is the zero address and
#
#     require(msg.sender == platformOperator, "Only platform operator");
#
# rejects everyone. That call is the FIRST leg of the Safe-registration batch in
# `registerUserSafeOnV2Contracts`, so the whole batch reverts — which is the "EMPTY REVERT
# DETECTED" wall that repeats on every subscribe, skip and claim in the Railway logs. The second
# leg (PlayOracleV3.registerUserSafeAsOperator) is fine; it never gets reached.
#
# ## Why a file and not a command to paste
#
# The same reason as contracts/deploy-passport.sh: a wrapped one-liner splits at the terminal
# margin. Pasting this as one line on 2026-08-23 broke `cast send <contract> "<sig>"` away from
# its argument, so the address ran as its own command and `--rpc-url` went with the tail —
# cast fell back to localhost:8545 and refused to connect. Nothing was sent that time. A file
# has no margin.
#
# Reversible: `setPlatformOperator` is onlyOwner and can be re-pointed or zeroed.

set -euo pipefail

PASSPORT_V4=0x4D5533e29Cf190131885Dc7Dbef22e31F4252410
PLATFORM_SAFE=0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA
RPC=https://rpc.monad.xyz

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env not found in $(pwd)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "❌ DEPLOYER_PRIVATE_KEY is not set in .env" >&2
  exit 1
fi

SIGNER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
OWNER=$(cast call "$PASSPORT_V4" "owner()(address)" --rpc-url "$RPC")

echo "contract : $PASSPORT_V4"
echo "signer   : $SIGNER"
echo "owner    : $OWNER"
echo "operator : $PLATFORM_SAFE  (matches PlayOracleV3.platformOperator)"
echo

# The setter is onlyOwner. Checking here turns a paid revert into a free refusal.
if [ "$(echo "$SIGNER" | tr 'A-Z' 'a-z')" != "$(echo "$OWNER" | tr 'A-Z' 'a-z')" ]; then
  echo "❌ signer is not the owner — refusing to send" >&2
  exit 1
fi

BEFORE=$(cast call "$PASSPORT_V4" "platformOperator()(address)" --rpc-url "$RPC")
echo "platformOperator before: $BEFORE"

if [ "$(echo "$BEFORE" | tr 'A-Z' 'a-z')" = "$(echo "$PLATFORM_SAFE" | tr 'A-Z' 'a-z')" ]; then
  echo "✅ already set — nothing to do"
  exit 0
fi

# Simulate before paying. A revert here costs nothing.
echo "simulating…"
cast call "$PASSPORT_V4" "setPlatformOperator(address)" "$PLATFORM_SAFE" \
  --from "$SIGNER" --rpc-url "$RPC" > /dev/null
echo "✅ simulation passed"
echo

echo "sending…"
cast send "$PASSPORT_V4" "setPlatformOperator(address)" "$PLATFORM_SAFE" \
  --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC"

AFTER=$(cast call "$PASSPORT_V4" "platformOperator()(address)" --rpc-url "$RPC")
echo
echo "platformOperator after: $AFTER"

if [ "$(echo "$AFTER" | tr 'A-Z' 'a-z')" = "$(echo "$PLATFORM_SAFE" | tr 'A-Z' 'a-z')" ]; then
  echo "✅ set"
else
  echo "❌ value did not change — investigate before retrying" >&2
  exit 1
fi
