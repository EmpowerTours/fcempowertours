#!/bin/bash

# Deploy V3 Contract using Foundry
# This ensures deployment settings match verification settings

set -e

CONTRACT_NAME="EmpowerToursYieldStrategyV3"
CONTRACT_PATH="contracts/EmpowerToursYieldStrategyV3.sol"

# Constructor arguments
TOURS_TOKEN="0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B"
KINTSU="0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5"
TOKEN_SWAP="0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2"
DRAGON_ROUTER="0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea"
KEEPER="0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9"

# Load private key from env
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ Error: DEPLOYER_PRIVATE_KEY not set"
    echo ""
    echo "Export your private key:"
    echo "  export DEPLOYER_PRIVATE_KEY=0x..."
    echo ""
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying EmpowerToursYieldStrategyV3 with Foundry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Foundry is installed
if ! command -v forge &> /dev/null || ! command -v cast &> /dev/null; then
    echo "❌ Foundry not found!"
    echo ""
    echo "Install Foundry:"
    echo "  curl -L https://foundry.paradigm.xyz | bash"
    echo "  foundryup"
    echo ""
    exit 1
fi

echo "✅ Foundry found: $(forge --version | head -1)"
echo ""

# Show constructor arguments
echo "Constructor Arguments:"
echo "  TOURS Token:   $TOURS_TOKEN"
echo "  Kintsu:        $KINTSU"
echo "  TokenSwap:     $TOKEN_SWAP"
echo "  DragonRouter:  $DRAGON_ROUTER"
echo "  Keeper:        $KEEPER"
echo ""

# Encode constructor args
echo "Encoding constructor arguments..."
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address,address,address,address)" \
    "$TOURS_TOKEN" \
    "$KINTSU" \
    "$TOKEN_SWAP" \
    "$DRAGON_ROUTER" \
    "$KEEPER")

echo "✅ Constructor args encoded"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Deploying to Monad Testnet..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Deploy using forge create
# Uses settings from foundry.toml automatically
forge create "$CONTRACT_PATH:$CONTRACT_NAME" \
    --rpc-url https://testnet-rpc.monad.xyz \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --constructor-args "$TOURS_TOKEN" "$KINTSU" "$TOKEN_SWAP" "$DRAGON_ROUTER" "$KEEPER" \
    --json > /tmp/deploy_output.json

CONTRACT_ADDRESS=$(cat /tmp/deploy_output.json | jq -r '.deployedTo')

if [ -z "$CONTRACT_ADDRESS" ] || [ "$CONTRACT_ADDRESS" == "null" ]; then
    echo "❌ Deployment failed!"
    echo ""
    echo "Check /tmp/deploy_output.json for error details"
    echo ""
    echo "Try deploying manually:"
    echo "  forge create $CONTRACT_PATH:$CONTRACT_NAME \\"
    echo "    --rpc-url https://testnet-rpc.monad.xyz \\"
    echo "    --private-key \$DEPLOYER_PRIVATE_KEY \\"
    echo "    --constructor-args $TOURS_TOKEN $KINTSU $TOKEN_SWAP $DRAGON_ROUTER $KEEPER"
    echo ""
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ V3 CONTRACT DEPLOYED SUCCESSFULLY!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Network: Monad Testnet (10143)"
echo ""
echo "Compiler Settings (from foundry.toml):"
echo "  Version: 0.8.30"
echo "  Optimization: Enabled (10000 runs)"
echo "  Via IR: Yes"
echo "  EVM Version: paris"
echo ""

# Update VERIFY_COMMAND.sh with new address
echo "Updating VERIFY_COMMAND.sh with new address..."
sed -i "s/CONTRACT_ADDRESS=\"0x[a-fA-F0-9]*\"/CONTRACT_ADDRESS=\"$CONTRACT_ADDRESS\"/" VERIFY_COMMAND.sh
echo "✅ VERIFY_COMMAND.sh updated"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Verify the contract:"
echo "   ./VERIFY_COMMAND.sh"
echo ""
echo "2. Update .env file:"
echo "   YIELD_STRATEGY_V3=$CONTRACT_ADDRESS"
echo ""
echo "3. Whitelist Passport NFT:"
echo "   node scripts/whitelist-execute.mjs addAcceptedNFT 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8"
echo ""
echo "4. View on explorer:"
echo "   https://testnet.monadexplorer.com/address/$CONTRACT_ADDRESS"
echo ""
