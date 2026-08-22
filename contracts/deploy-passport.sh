#!/usr/bin/env bash
# Deploy PassportNFTV4 — the redeploy that adds migrateLegacyPassport.
#
# ## Why this is a script rather than a command to paste
#
# The one-liner version got line-wrapped by the terminal, which split
#   `WMON=0x… forge script …`
# into a standalone shell assignment plus a separate command. forge then ran without WMON set
# and reverted on `vm.envAddress: environment variable "WMON" not found` — after already
# spending gas deploying the script contract itself. A file cannot be mangled by wrapping.
#
# Run:  bash contracts/deploy-passport.sh
#
# Reads DEPLOYER_PRIVATE_KEY from ../.env. The key is never printed and never enters shell
# history. You are the one broadcasting — the agent is blocked from running this, by design.
set -euo pipefail
cd "$(dirname "$0")"

RPC="https://monad-mainnet.g.alchemy.com/v2/QM9CqBmMU3Bu9ovRgNXZZ"

# Constructor arguments, the same three used for the six already verified on Monadscan.
export WMON=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
export ORACLE=0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf
export TREASURY=0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA

set -a
# shellcheck disable=SC1091
. ../.env
set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is not set in ../.env}"

# Deploying from the wrong key would produce a passport contract owned by nobody useful, so
# check before spending anything. Only the derived address is printed, never the key.
SENDER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
EXPECTED=0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1
if [ "${SENDER,,}" != "${EXPECTED,,}" ]; then
  echo "REFUSING: ../.env holds a different key."
  echo "  derived : $SENDER"
  echo "  expected: $EXPECTED  (owns the registry, oracle and radio)"
  exit 1
fi

NONCE=$(cast nonce "$SENDER" --rpc-url "$RPC")
PREDICTED=$(cast compute-address "$SENDER" --nonce "$NONCE" | grep -oE '0x[a-fA-F0-9]{40}')
echo "sender    : $SENDER"
echo "nonce     : $NONCE"
echo "will land : $PREDICTED"
echo "balance   : $(cast balance "$SENDER" --rpc-url "$RPC" --ether) MON"
echo

forge script script/DeployV3Steps.s.sol:Step5_PassportNFTV4 --rpc-url "$RPC" --broadcast

echo
echo "=== confirming on-chain ==="
CODE=$(cast code "$PREDICTED" --rpc-url "$RPC")
if [ ${#CODE} -le 2 ]; then
  echo "WARNING: no code at $PREDICTED — the deploy did not land where expected."
  exit 1
fi
echo "PassportNFTV4 deployed at $PREDICTED ($(( (${#CODE} - 2) / 2 )) bytes)"

# The entire reason for redeploying: this function was absent from the previous PassportNFTV4,
# and without it the three passports lose their original mint dates.
#
# The selector comes from the compiled artifact, never from a signature typed here. A typed one
# was wrong — the last parameter is uint256, not uint64 — which produced a selector no function
# answers and a confident "ABSENT" verdict about a contract that was fine.
SEL=0x$(forge inspect PassportNFTV4 methodIdentifiers \
  | awk -F'|' '$2 ~ /migrateLegacyPassport\(/ { gsub(/ /,"",$3); print $3 }')
if [ "$SEL" = "0x" ]; then
  echo "WARNING: migrateLegacyPassport is not in the compiled ABI at all."
  exit 1
fi
case "$CODE" in
  *${SEL:2}*)
    echo "migrateLegacyPassport present — the passports can keep their mint dates"
    ;;
  *)
    echo "WARNING: migrateLegacyPassport is ABSENT from the deployed bytecode. Do not proceed."
    exit 1
    ;;
esac

echo
echo "Tell the agent the address above, or it will read it from"
echo "  contracts/broadcast/DeployV3Steps.s.sol/143/run-latest.json"
