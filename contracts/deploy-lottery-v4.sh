#!/bin/bash
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Load environment variables
source .env

# Deploy DailyPassLotteryV4 with Switchboard randomness
# Constructor args:
# Arg 0: switchboard = 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33 (Monad Testnet)
# Arg 1: platformSafe = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
# Arg 2: platformWallet = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0
# Arg 3: shMonToken = 0x3a98250F98Dd388C211206983453837C8365BDc1

echo "Deploying DailyPassLotteryV4 with Switchboard..."

forge create --broadcast \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --verify \
  --verifier sourcify \
  --verifier-url https://testnet.monadexplorer.com/api/v1/sourcify/server/verify \
  contracts/DailyPassLotteryV4.sol:DailyPassLotteryV4 \
  --constructor-args 0xD3860E2C66cBd5c969Fa7343e6912Eff0416bA33 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 0x33fFCcb1802e13a7eead232BCd4706a2269582b0 0x3a98250F98Dd388C211206983453837C8365BDc1

echo "Done! Contract deployed and verified on Monad Explorer"
