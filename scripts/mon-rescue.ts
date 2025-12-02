import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// CONFIGURATION
const COMPROMISED_PRIVATE_KEY = '0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6' as `0x${string}`;
const SAFE_DESTINATION_ADDRESS = '0x42592CB1a8D5F40099A36420b73f9971Bc95bAE7' as `0x${string}`;

// Monad RPC - use multiple endpoints for redundancy
const MONAD_RPCS = [
  'https://rpc.monad.xyz',
  'https://mainnet.monad.xyz/v1',
];

const POLL_INTERVAL_MS = 10; // 10ms = 100 checks per second
const GAS_MULTIPLIER = 5n; // 5x gas price to outbid

// Define Monad chain
const monad = {
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPCS[0]] },
  },
} as const;

const account = privateKeyToAccount(COMPROMISED_PRIVATE_KEY);
const COMPROMISED_ADDRESS = account.address;

// Create multiple clients for speed
const publicClients = MONAD_RPCS.map(rpc =>
  createPublicClient({
    chain: monad,
    transport: http(rpc, { timeout: 5000 }),
  })
);

const walletClients = MONAD_RPCS.map(rpc =>
  createWalletClient({
    account,
    chain: monad,
    transport: http(rpc, { timeout: 5000 }),
  })
);

console.log('🚨 MON RESCUE SCRIPT - AGGRESSIVE MODE');
console.log('======================================');
console.log(`Monitoring: ${COMPROMISED_ADDRESS}`);
console.log(`Safe destination: ${SAFE_DESTINATION_ADDRESS}`);
console.log(`Poll interval: ${POLL_INTERVAL_MS}ms (${1000/POLL_INTERVAL_MS} checks/sec)`);
console.log(`Gas multiplier: ${GAS_MULTIPLIER}x`);
console.log(`Using ${MONAD_RPCS.length} RPC endpoints`);
console.log('\nStarting monitor...\n');

let isTransferring = false;
let checkCount = 0;
let lastLogTime = Date.now();

async function checkAndRescue() {
  if (isTransferring) return;

  checkCount++;

  // Log status every 10 seconds
  if (Date.now() - lastLogTime > 10000) {
    console.log(`[${new Date().toISOString()}] Checks: ${checkCount} | Status: Monitoring...`);
    lastLogTime = Date.now();
  }

  // Check all RPCs in parallel for fastest response
  const balancePromises = publicClients.map(client =>
    client.getBalance({ address: COMPROMISED_ADDRESS }).catch(() => 0n)
  );

  try {
    const balances = await Promise.race([
      Promise.any(balancePromises.map(p => p.then(b => b > 0n ? b : Promise.reject()))),
      new Promise<0n>((resolve) => setTimeout(() => resolve(0n), 1000))
    ]).catch(() => 0n);

    if (balances > 0n) {
      console.log(`\n💰💰💰 BALANCE DETECTED: ${formatEther(balances)} MON 💰💰💰`);
      console.log('🏃🏃🏃 RACING TO RESCUE...');

      isTransferring = true;

      // Get gas price and calculate max amount
      const gasPrice = await publicClients[0].getGasPrice().catch(() => 1000000000n);
      const aggressiveGasPrice = gasPrice * GAS_MULTIPLIER;
      const gasLimit = 21000n;
      const gasCost = aggressiveGasPrice * gasLimit;

      const amountToSend = balances - gasCost;

      if (amountToSend <= 0n) {
        console.log('❌ Balance too low to cover gas');
        isTransferring = false;
        return;
      }

      console.log(`📤 Sending ${formatEther(amountToSend)} MON`);
      console.log(`⛽ Gas price: ${aggressiveGasPrice} (${GAS_MULTIPLIER}x normal)`);

      // Send from ALL wallets simultaneously for max speed
      const txPromises = walletClients.map(client =>
        client.sendTransaction({
          to: SAFE_DESTINATION_ADDRESS,
          value: amountToSend,
          gas: gasLimit,
          maxFeePerGas: aggressiveGasPrice,
          maxPriorityFeePerGas: aggressiveGasPrice,
        }).catch(e => {
          console.log(`TX attempt failed: ${e.message?.slice(0, 50)}`);
          return null;
        })
      );

      const results = await Promise.allSettled(txPromises);
      const successfulTx = results.find(r => r.status === 'fulfilled' && r.value);

      if (successfulTx && successfulTx.status === 'fulfilled' && successfulTx.value) {
        console.log(`\n✅✅✅ RESCUE TX SENT: ${successfulTx.value}`);
        console.log(`🔍 Check explorer for confirmation`);

        // Wait for confirmation
        try {
          const receipt = await publicClients[0].waitForTransactionReceipt({
            hash: successfulTx.value,
            timeout: 60000
          });

          if (receipt.status === 'success') {
            console.log('\n🎉🎉🎉 RESCUE SUCCESSFUL! MON SAVED! 🎉🎉🎉');
          } else {
            console.log('❌ Transaction failed on-chain');
          }
        } catch (e) {
          console.log('Could not confirm - check explorer');
        }
      } else {
        console.log('❌ All transfer attempts failed');
      }

      isTransferring = false;
    }
  } catch (error) {
    // Silently continue
  }
}

// Run aggressive polling
setInterval(checkAndRescue, POLL_INTERVAL_MS);

// Also run immediately
checkAndRescue();

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Stopping rescue script...');
  console.log(`Total checks performed: ${checkCount}`);
  process.exit(0);
});

console.log('Press Ctrl+C to stop.\n');
