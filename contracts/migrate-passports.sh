#!/usr/bin/env bash
# Migrate the three legacy passports into PassportNFTV4, keeping their original mint dates.
#
# ## Why this is a file and not a command to paste
#
# The one-liner version was wrapped by the terminal. The break landed immediately before
# `"$DEPLOYER_PRIVATE_KEY"`, so bash expanded the variable at the start of a line and tried to
# run it as a command — printing the private key into the error output. A file cannot be
# re-wrapped, and nothing here ever puts the key on a line of its own.
#
# Run:  bash contracts/migrate-passports.sh
set -euo pipefail
cd "$(dirname "$0")"

RPC="https://monad-mainnet.g.alchemy.com/v2/QM9CqBmMU3Bu9ovRgNXZZ"
PASSPORT=0x4D5533e29Cf190131885Dc7Dbef22e31F4252410
# The passports stay with the Farcaster wallet that holds them today.
HOLDER=0x33fFCcb1802e13a7eead232BCd4706a2269582b0
FID=765994
SIG="migrateLegacyPassport(address,uint256,string,string,string,string,string,uint256)"

set -a
# shellcheck disable=SC1091
. ../.env
set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is not set in ../.env}"

if [ "$(cast call "$PASSPORT" 'passportMigrationSealed()(bool)' --rpc-url "$RPC")" = "true" ]; then
  echo "Migration is already sealed on $PASSPORT — nothing can be added."
  exit 1
fi

# code | name | region | continent | original mintedAt (read from the old contract)
ROWS=(
  "MX|Mexico|Central America|North America|1769157019"
  "FR|France|Western Europe|Europe|1770573209"
  "CN|China|Eastern Asia|Asia|1770729681"
)

for row in "${ROWS[@]}"; do
  IFS='|' read -r CODE NAME REGION CONTINENT MINTED <<<"$row"
  printf '%-3s %-8s ' "$CODE" "$NAME"

  OUT=$(cast send "$PASSPORT" "$SIG" \
    "$HOLDER" "$FID" "$CODE" "$NAME" "$REGION" "$CONTINENT" "" "$MINTED" \
    --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --json)

  STATUS=$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status"))')
  TXH=$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("transactionHash"))')
  echo "$STATUS $TXH"
  [ "$STATUS" = "0x1" ] || { echo "FAILED — stopping before the rest."; exit 1; }
done

echo
echo "=== confirming, including that the mint dates survived ==="
TOTAL=$(cast call "$PASSPORT" 'totalPassports()(uint256)' --rpc-url "$RPC" 2>/dev/null \
        || cast call "$PASSPORT" 'balanceOf(address)(uint256)' "$HOLDER" --rpc-url "$RPC")
echo "held by $HOLDER: $TOTAL"
for id in 1 2 3; do
  cast call "$PASSPORT" 'getPassportData(uint256)((uint256,string,string,string,string,uint256,uint256,string))' \
    "$id" --rpc-url "$RPC" 2>/dev/null | sed "s/^/  token $id: /"
done
