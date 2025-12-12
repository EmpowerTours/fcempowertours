#!/bin/bash
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Load environment variables
source .env

# Contract addresses (UPDATE THESE AFTER DEPLOYMENT)
BEAT_MATCH_V3="0xF8149b7EF0393170a5fB8Aef0BC54bC2eb7d1681"
COUNTRY_COLLECTOR_V3="0xb0Bcd237DB21704D6ecfb6b96F8b2b5D136Ea87F"

# Constructor args
SWITCHBOARD="0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33"
TOURS_TOKEN="0xa123600c82E69cB311B0e068B06Bfa9F787699B7"
PLATFORM_SAFE="0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"
RESOLVER="0x37302543aeF0b06202adcb06Db36daB05F8237E9"

if [ -z "$BEAT_MATCH_V3" ] || [ -z "$COUNTRY_COLLECTOR_V3" ]; then
  echo "❌ Please update BEAT_MATCH_V3 and COUNTRY_COLLECTOR_V3 addresses in this script"
  exit 1
fi

echo "=================================="
echo "Verifying Game Contracts V3"
echo "=================================="
echo ""

# =============================================================================
# Verify MusicBeatMatchV3
# =============================================================================

echo "📀 Verifying MusicBeatMatchV3 at $BEAT_MATCH_V3..."
echo ""

CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address,address,address)" $SWITCHBOARD $TOURS_TOKEN $PLATFORM_SAFE $RESOLVER)

forge verify-contract \
  $BEAT_MATCH_V3 \
  contracts/MusicBeatMatchV3.sol:MusicBeatMatchV3 \
  --chain monad-testnet \
  --constructor-args $CONSTRUCTOR_ARGS \
  --watch

if [ $? -ne 0 ]; then
  echo "❌ MusicBeatMatchV3 verification failed"
  exit 1
fi

echo ""
echo "✅ MusicBeatMatchV3 verified!"
echo ""

# =============================================================================
# Verify CountryCollectorV3
# =============================================================================

echo "🌍 Verifying CountryCollectorV3 at $COUNTRY_COLLECTOR_V3..."
echo ""

forge verify-contract \
  $COUNTRY_COLLECTOR_V3 \
  contracts/CountryCollectorV3.sol:CountryCollectorV3 \
  --chain monad-testnet \
  --constructor-args $CONSTRUCTOR_ARGS \
  --watch

if [ $? -ne 0 ]; then
  echo "❌ CountryCollectorV3 verification failed"
  exit 1
fi

echo ""
echo "✅ CountryCollectorV3 verified!"
echo ""

echo "=================================="
echo "✅ All contracts verified!"
echo "=================================="
echo ""
