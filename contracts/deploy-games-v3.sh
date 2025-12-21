#!/bin/bash
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Load environment variables
source .env

# Contract addresses
SWITCHBOARD="0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33"  # Monad Testnet
TOURS_TOKEN="0xa123600c82E69cB311B0e068B06Bfa9F787699B7"
PLATFORM_SAFE="0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"
RESOLVER="0x37302543aeF0b06202adcb06Db36daB05F8237E9"  # Safe owner (bot wallet)

echo "=================================="
echo "Deploying Game Contracts V3"
echo "=================================="
echo ""
echo "Switchboard:   $SWITCHBOARD"
echo "TOURS Token:   $TOURS_TOKEN"
echo "Platform Safe: $PLATFORM_SAFE"
echo "Resolver:      $RESOLVER"
echo ""

# =============================================================================
# Deploy MusicBeatMatchV3
# =============================================================================

echo "📀 Deploying MusicBeatMatchV3..."
echo ""

forge create --broadcast \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  contracts/MusicBeatMatchV3.sol:MusicBeatMatchV3 \
  --constructor-args $SWITCHBOARD $TOURS_TOKEN $PLATFORM_SAFE $RESOLVER

if [ $? -ne 0 ]; then
  echo "❌ MusicBeatMatchV3 deployment failed"
  exit 1
fi

echo ""
echo "✅ MusicBeatMatchV3 deployed successfully!"
echo ""

# Get deployed address (you'll need to extract this from the output manually)
# BEAT_MATCH_V3="0x..."

echo "⏳ Waiting 10 seconds before next deployment..."
sleep 10

# =============================================================================
# Deploy CountryCollectorV3
# =============================================================================

echo "🌍 Deploying CountryCollectorV3..."
echo ""

forge create --broadcast \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  contracts/CountryCollectorV3.sol:CountryCollectorV3 \
  --constructor-args $SWITCHBOARD $TOURS_TOKEN $PLATFORM_SAFE $RESOLVER

if [ $? -ne 0 ]; then
  echo "❌ CountryCollectorV3 deployment failed"
  exit 1
fi

echo ""
echo "✅ CountryCollectorV3 deployed successfully!"
echo ""

echo "=================================="
echo "✅ All contracts deployed!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Copy the deployed addresses from the output above"
echo "2. Verify both contracts on Monadscan"
echo "3. Update .env.local with new contract addresses"
echo "4. Update empowertours-envio/config.yaml with addresses"
echo "5. Fund both contracts with TOURS tokens for rewards"
echo ""
