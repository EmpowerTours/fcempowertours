#!/bin/bash

# FundContracts.sh - Fund reward contracts with TOURS tokens
# Usage: ./script/FundContracts.sh

set -e

echo "=========================================="
echo "FUNDING EMPOWERTOURS CONTRACTS"
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

TOURS_TOKEN="0xa123600c82E69cB311B0e068B06Bfa9F787699B7"
AMOUNT="10000000000000000000000"  # 10,000 TOURS

echo "Funding each contract with 10,000 TOURS..."
echo ""

echo "1/3 Funding ItineraryNFT..."
cast send $TOURS_TOKEN \
    "transfer(address,uint256)" \
    $ITINERARY_NFT_ADDR \
    $AMOUNT \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
echo "✓ ItineraryNFT funded"

echo ""
echo "2/3 Funding MusicBeatMatch..."
cast send $TOURS_TOKEN \
    "transfer(address,uint256)" \
    $BEAT_MATCH_ADDR \
    $AMOUNT \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
echo "✓ MusicBeatMatch funded"

echo ""
echo "3/3 Funding CountryCollector..."
cast send $TOURS_TOKEN \
    "transfer(address,uint256)" \
    $COUNTRY_COLLECTOR_ADDR \
    $AMOUNT \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
echo "✓ CountryCollector funded"

echo ""
echo "=========================================="
echo "FUNDING COMPLETE!"
echo "Each contract has 10,000 TOURS for rewards"
echo "=========================================="
echo ""
echo "Verify balances:"
echo "cast call $TOURS_TOKEN \"balanceOf(address)\" $ITINERARY_NFT_ADDR --rpc-url monad_testnet"
echo "cast call $TOURS_TOKEN \"balanceOf(address)\" $BEAT_MATCH_ADDR --rpc-url monad_testnet"
echo "cast call $TOURS_TOKEN \"balanceOf(address)\" $COUNTRY_COLLECTOR_ADDR --rpc-url monad_testnet"
