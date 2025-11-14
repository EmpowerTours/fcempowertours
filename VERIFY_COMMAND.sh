#!/bin/bash

# V3 Contract Verification Command for Foundry
# Run this once Foundry (forge/cast) is installed

CONTRACT_ADDRESS="0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086"
API_KEY="FQSX86QUTQYPUNG1WJTYBNC665XPTRYD6J"

# Constructor arguments
TOURS_TOKEN="0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B"
KINTSU="0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5"
TOKEN_SWAP="0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2"
DRAGON_ROUTER="0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea"
KEEPER="0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying EmpowerToursYieldStrategyV3 on Monadscan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Contract: $CONTRACT_ADDRESS"
echo "Network: Monad Testnet (10143)"
echo ""

# Check if forge and cast are available
if ! command -v forge &> /dev/null || ! command -v cast &> /dev/null; then
    echo "❌ Foundry not found!"
    echo ""
    echo "Please install Foundry first:"
    echo "  curl -L https://foundry.paradigm.xyz | bash"
    echo "  foundryup"
    echo ""
    echo "Or add to PATH if already installed:"
    echo "  export PATH=\"\$HOME/.foundry/bin:\$PATH\""
    echo ""
    exit 1
fi

echo "✅ Foundry found: $(forge --version | head -1)"
echo ""

# Run verification
echo "🚀 Submitting verification..."
echo ""

forge verify-contract \
  --watch \
  --chain-id 10143 \
  --compiler-version v0.8.20+commit.a1b79de6 \
  --optimizer-runs 10000 \
  --via-ir \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" "$TOURS_TOKEN" "$KINTSU" "$TOKEN_SWAP" "$DRAGON_ROUTER" "$KEEPER") \
  --etherscan-api-key "$API_KEY" \
  "$CONTRACT_ADDRESS" \
  contracts/EmpowerToursYieldStrategyV3.sol:EmpowerToursYieldStrategyV3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Verification Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "View contract at:"
echo "https://testnet.monadexplorer.com/address/$CONTRACT_ADDRESS"
echo ""
