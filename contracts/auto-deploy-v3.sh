#!/bin/bash
set -e

echo "🔨 Waiting for DailyPassLotteryV3 compilation..."
echo "This takes 10-12 minutes with viaIR enabled..."
echo ""

# Wait for compilation to complete
while true; do
  if grep -q "Compiler run successful" /tmp/v3-build.log 2>/dev/null; then
    echo "✅ Compilation complete!"
    break
  fi

  if grep -q "Error" /tmp/v3-build.log 2>/dev/null; then
    echo "❌ Compilation failed!"
    tail -30 /tmp/v3-build.log
    exit 1
  fi

  # Show progress
  echo -n "."
  sleep 10
done

echo ""
echo "🚀 Deploying DailyPassLotteryV3 to Monad Testnet..."
echo ""

forge script script/DeployDailyPassLotteryV3.s.sol:DeployDailyPassLotteryV3 \
  --rpc-url monad_testnet \
  --broadcast \
  --legacy \
  --skip-simulation

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update NEXT_PUBLIC_LOTTERY_ADDRESS in .env.local"
echo "2. Restart Next.js app"
echo "3. Test lottery entry"
