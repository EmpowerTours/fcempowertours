#!/bin/bash
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Deploy DailyPassLotterySecure with correct args:
# Arg 0: platformWallet = 0x33fFCcb1802e13a7eead232BCd4706a2269582b0
# Arg 1: shMonToken = 0x3a98250F98Dd388C211206983453837C8365BDc1

forge create contracts/DailyPassLotterySecure.sol:DailyPassLotterySecure \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key 0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6 \
  --constructor-args 0x33fFCcb1802e13a7eead232BCd4706a2269582b0 0x3a98250F98Dd388C211206983453837C8365BDc1 \
  --broadcast
