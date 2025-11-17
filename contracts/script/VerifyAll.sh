#!/bin/bash

# VerifyAll.sh - Verify all deployed contracts on Monad testnet
# Usage: ./script/VerifyAll.sh

set -e

echo "=========================================="
echo "VERIFYING EMPOWERTOURS CONTRACTS"
echo "Network: Monad Testnet"
echo "=========================================="
echo ""

# Check if addresses file exists
if [ ! -f "deployed_addresses.txt" ]; then
    echo "Error: deployed_addresses.txt not found"
    echo "Please run the deployment script first and save the addresses"
    exit 1
fi

# Source the addresses
source deployed_addresses.txt

# Existing contract addresses
PASSPORT_NFT_V3="0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163"
TOURS_TOKEN="0xa123600c82E69cB311B0e068B06Bfa9F787699B7"
KEEPER="0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"

echo "1/5 Verifying ActionBasedDemandSignal..."
forge verify-contract $DEMAND_SIGNAL_ADDR \
    contracts/ActionBasedDemandSignal.sol:ActionBasedDemandSignal \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address)" $KEEPER) \
    --watch

echo ""
echo "2/5 Verifying ItineraryNFT..."
forge verify-contract $ITINERARY_NFT_ADDR \
    contracts/ItineraryNFT.sol:ItineraryNFT \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address)" $PASSPORT_NFT_V3 $TOURS_TOKEN) \
    --watch

echo ""
echo "3/5 Verifying MusicBeatMatch..."
forge verify-contract $BEAT_MATCH_ADDR \
    contracts/MusicBeatMatch.sol:MusicBeatMatch \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address)" $TOURS_TOKEN $KEEPER) \
    --watch

echo ""
echo "4/5 Verifying CountryCollector..."
forge verify-contract $COUNTRY_COLLECTOR_ADDR \
    contracts/CountryCollector.sol:CountryCollector \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address,address)" $TOURS_TOKEN $PASSPORT_NFT_V3 $KEEPER) \
    --watch

echo ""
echo "5/5 Verifying TandaPool..."
forge verify-contract $TANDA_POOL_ADDR \
    contracts/TandaPool.sol:TandaPool \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address)" $TOURS_TOKEN) \
    --watch

echo ""
echo "=========================================="
echo "VERIFICATION COMPLETE!"
echo "All contracts verified on MonadScan"
echo "=========================================="
