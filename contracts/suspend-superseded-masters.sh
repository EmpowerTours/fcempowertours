#!/usr/bin/env bash
# Suspend v3 masters that a later re-publish has superseded.
#
#   bash contracts/suspend-superseded-masters.sh              # DRY RUN (default)
#   BROADCAST=1 bash contracts/suspend-superseded-masters.sh  # actually send
#
# ## What this is cleaning up
#
# The v3 migration minted the existing catalogue from the DEPLOYER key, and
# `mintMaster` sets the artist to msg.sender — so those masters name the platform
# as the artist. The artists then re-published from their own wallets, which
# minted a SECOND master at the same tokenURI with the right artist. Nothing ever
# retired the first. The registry therefore lists some recordings twice, under two
# different artists, and the API only hides that in its own responses.
#
# ## The rule, and the thing that is easy to get wrong
#
# Masters are grouped by the AUDIO file their metadata points at, NOT by tokenURI.
#
# The first version of this script grouped by tokenURI and found only one
# duplicate. Re-publishing writes a NEW metadata document — new name, new cover,
# new CID — that references the SAME audio. So #3 and #8 are the same recording
# with different tokenURIs, and a tokenURI grouping cannot see it. The audio CID
# is the recording's identity, and it is what the API's catalogue dedupe already
# keys on; grouping on anything else here would leave the registry disagreeing
# with what listeners are served.
#
# Among the live masters on one audio file the HIGHEST id wins, matching the API.
# Every other live master on that audio is suspended.
#
# ## The safety property, which is also the running order
#
# A master is NEVER suspended unless another LIVE master shares its tokenURI.
# Nothing here can remove the last copy of a recording, so you cannot delete a
# song by running this at the wrong time.
#
# That is what sequences the work for you. "Money Making Machine" (#1) and
# "Suddenly" (#2) exist only as deployer-minted copies, so this script will refuse
# them and say so. Re-publish those two from the artist profile first; once their
# correctly-attributed copies exist, run this again and they become eligible.
#
# So: run it now to clear the already-superseded ones, re-publish #1 and #2, then
# run it again.
#
# ## What suspension does and does not do
#
# From LicenseRegistry.sol: it does NOT affect existing licence holders —
# hasValidLicense still answers true for anyone who already paid, "their copy is
# their property, not leverage over the artist" — and it does NOT touch payouts.
# It is reversible via setMasterSuspended(id, false, ""), and it records the
# reason on-chain. A PURGED master cannot be suspended and is skipped.
set -euo pipefail
cd "$(dirname "$0")"

RPC="${MONAD_RPC:-https://rpc.monad.xyz}"
REG="${LICENSE_REGISTRY:-0x42EbcD44C2295702130f0A641633c691bA5f9480}"
BROADCAST="${BROADCAST:-}"
# Says the same AUDIO, not the same tokenURI. The two differ and the difference is
# the whole reason this script groups the way it does: a re-publish writes a NEW
# metadata document, so the superseded master and its replacement have different
# tokenURIs and identical audio. The first four suspensions (#3 #4 #5 #7, 2026-09-05)
# went out with the tokenURI wording, which is wrong; it is recorded on-chain and not
# worth a transaction to correct.
REASON="${REASON:-superseded by a re-publish of the same audio}"

TOTAL=$(cast call "$REG" "totalMasters()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
echo "registry $REG"
echo "masters  $TOTAL"
echo

GATEWAY="${PINATA_GATEWAY:-https://harlequin-used-hare-224.mypinata.cloud/ipfs/}"
resolve() { case "$1" in ipfs://*) printf '%s%s' "$GATEWAY" "${1#ipfs://}";; *) printf '%s' "$1";; esac; }

# Collect id -> audio / artist / state. Suspended and purged masters are recorded
# but never counted as the survivor: a suspended master must not keep another one
# suspended.
declare -A AUDIO ARTIST DEAD
for ((i=1; i<=TOTAL; i++)); do
  u=$(cast call "$REG" "tokenURI(uint256)(string)" "$i" --rpc-url "$RPC" 2>/dev/null | tr -d '"') || u=""
  [ -z "$u" ] && continue

  # The audio file, from the metadata document. A master whose metadata will not
  # resolve is left out entirely rather than guessed at: an unreadable document
  # could be a duplicate or the last copy of something, and suspending on a guess
  # is exactly the mistake this script must not make.
  meta=$(curl -fsS --max-time 20 "$(resolve "$u")" 2>/dev/null) || meta=""
  if [ -z "$meta" ]; then
    echo "  WARNING: #$i metadata unreadable at $u - excluded from the plan" >&2
    continue
  fi
  aud=$(printf '%s' "$meta" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('animation_url') or d.get('audio_url') or '')" 2>/dev/null)
  [ -z "$aud" ] && { echo "  WARNING: #$i has no audio in its metadata - excluded" >&2; continue; }

  a=$(cast call "$REG" "getMaster(uint256)(address,uint256,uint64,uint32,uint32,uint8,address,uint96,address)" "$i" --rpc-url "$RPC" 2>/dev/null | head -1)
  s=$(cast call "$REG" "masterSuspended(uint256)(bool)" "$i" --rpc-url "$RPC" 2>/dev/null)
  p=$(cast call "$REG" "masterPurged(uint256)(bool)" "$i" --rpc-url "$RPC" 2>/dev/null)
  AUDIO[$i]="$(resolve "$aud")"; ARTIST[$i]="$a"
  [ "$s" = "true" ] || [ "$p" = "true" ] && DEAD[$i]=1 || true
done

# Highest LIVE id on each audio file is the survivor.
declare -A KEEP
for i in "${!AUDIO[@]}"; do
  [ -n "${DEAD[$i]:-}" ] && continue
  u="${AUDIO[$i]}"
  cur="${KEEP[$u]:-0}"
  [ "$i" -gt "$cur" ] && KEEP[$u]=$i
done

TO_SUSPEND=()
echo "plan"
for i in $(printf '%s\n' "${!AUDIO[@]}" | sort -n); do
  u="${AUDIO[$i]}"; short="${u: -12}"
  if [ -n "${DEAD[${i}]:-}" ]; then
    printf '  #%-3s %s  already suspended or purged, skipping\n' "$i" "$short"; continue
  fi
  keep="${KEEP[$u]}"
  if [ "$keep" = "$i" ]; then
    # Say WHY it is kept: sole copy reads very differently from survivor.
    n=0; for j in "${!AUDIO[@]}"; do [ "${AUDIO[$j]}" = "$u" ] && [ -z "${DEAD[$j]:-}" ] && n=$((n+1)); done
    if [ "$n" = 1 ]; then
      printf '  #%-3s %s  KEEP - only live copy of this recording\n' "$i" "$short"
    else
      printf '  #%-3s %s  KEEP - newest of %s live copies\n' "$i" "$short" "$n"
    fi
    continue
  fi
  printf '  #%-3s %s  SUSPEND - superseded by #%s (artist %s)\n' "$i" "$short" "$keep" "${ARTIST[$keep]}"
  TO_SUSPEND+=("$i")
done

echo
if [ ${#TO_SUSPEND[@]} -eq 0 ]; then
  echo "nothing to suspend."
  exit 0
fi
echo "would suspend: ${TO_SUSPEND[*]}"

if [ -z "$BROADCAST" ]; then
  echo
  echo "DRY RUN - nothing sent. Re-run with BROADCAST=1 to apply."
  exit 0
fi

PK=$(set -a; . ../.env >/dev/null 2>&1; printf %s "${DEPLOYER_PRIVATE_KEY:-}")
[ -n "$PK" ] || { echo "DEPLOYER_PRIVATE_KEY is not set in ../.env" >&2; exit 1; }
SENDER=$(cast wallet address --private-key "$PK")
echo
echo "sender $SENDER"

for i in "${TO_SUSPEND[@]}"; do
  EST=$(cast estimate "$REG" "setMasterSuspended(uint256,bool,string)" "$i" true "$REASON" --from "$SENDER" --rpc-url "$RPC")
  LIMIT=$(( EST * 130 / 100 ))
  echo "  suspending #$i (gas est $EST, limit $LIMIT)"
  cast send "$REG" "setMasterSuspended(uint256,bool,string)" "$i" true "$REASON" \
    --private-key "$PK" --rpc-url "$RPC" --gas-limit "$LIMIT" >/dev/null
  OK=$(cast call "$REG" "masterSuspended(uint256)(bool)" "$i" --rpc-url "$RPC")
  [ "$OK" = "true" ] || { echo "    WARNING: #$i still reads unsuspended" >&2; exit 1; }
  echo "    done"
done
echo
echo "suspended: ${TO_SUSPEND[*]}"
