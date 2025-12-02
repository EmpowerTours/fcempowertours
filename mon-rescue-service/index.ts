import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// CONFIGURATION - Use environment variables for security
const COMPROMISED_PRIVATE_KEY = (process.env.COMPROMISED_PRIVATE_KEY || '0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6') as `0x${string}`;
const SAFE_DESTINATION_ADDRESS = (process.env.SAFE_DESTINATION_ADDRESS || '0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1') as `0x${string}`;

// ⚡ ALCHEMY PREMIUM RPC - Monad Mainnet
const ALCHEMY_RPC = process.env.ALCHEMY_RPC || 'https://monad-mainnet.g.alchemy.com/v2/5RjiLS2xutF4TeoZg_saz';
const MONAD_RPCS = [ALCHEMY_RPC];

const POLL_INTERVAL_MS = 100; // 100ms = 10 checks/sec (aggressive with premium RPC)
const GAS_MULTIPLIER = 15n; // 15x gas price to DOMINATE mempool

// ERC-20 tokens to monitor on Monad Mainnet
const TOKENS_TO_MONITOR = [
  {
    address: '0x7DB5527120a1DAD455F9F334E4822ED719Ad8350' as `0x${string}`,
    name: 'GMONAD',
    decimals: 18,
  },
  {
    address: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as `0x${string}`,
    name: 'TOURS',
    decimals: 18,
  },
];

// ERC20 ABI for balanceOf and transfer
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Define Monad MAINNET chain
const monad = {
  id: 143, // MAINNET (not 10143 testnet!)
  name: 'Monad Mainnet',
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

console.log('🚨 MON RESCUE SERVICE - MAINNET FRONT-RUNNER v3');
console.log('=================================================');
console.log(`Started: ${new Date().toISOString()}`);
console.log(`Network: ⚡ Monad MAINNET (Chain ID: 143)`);
console.log(`RPC Provider: Alchemy Premium (Free Tier)`);
console.log(`Monitoring: ${COMPROMISED_ADDRESS}`);
console.log(`Safe destination: ${SAFE_DESTINATION_ADDRESS} (Wallet #1)`);
console.log(`Poll interval: ${POLL_INTERVAL_MS}ms (${1000/POLL_INTERVAL_MS} checks/sec)`);
console.log(`Gas multiplier: ${GAS_MULTIPLIER}x (MAXIMUM AGGRESSION)`);
console.log('\n🎯 Strategy: Detect incoming MON → Front-run hacker with 15x gas');
console.log('🔄 Starting continuous monitor...\n');

let isTransferring = false;
let checkCount = 0;
let lastLogTime = Date.now();
let rescued = false;
let lastMonBalance = 0n;
const lastTokenBalances = new Map<string, bigint>();

async function sweepToken(tokenAddress: `0x${string}`, tokenName: string, amount: bigint) {
  try {
    console.log(`\n💸 Sweeping ${formatEther(amount)} ${tokenName} to safe wallet...`);

    const gasPrice = await publicClients[0].getGasPrice().catch(() => 1000000000n);
    const aggressiveGasPrice = gasPrice * GAS_MULTIPLIER;

    console.log(`⛽ Gas price: ${aggressiveGasPrice} (${GAS_MULTIPLIER}x normal)`);

    // Send token transfer from ALL wallets simultaneously
    const txPromises = walletClients.map(client =>
      client.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [SAFE_DESTINATION_ADDRESS, amount],
        gas: 100000n,
        maxFeePerGas: aggressiveGasPrice,
        maxPriorityFeePerGas: aggressiveGasPrice,
      }).catch(e => {
        console.log(`Token TX attempt failed: ${e.message?.slice(0, 100)}`);
        return null;
      })
    );

    const results = await Promise.allSettled(txPromises);
    const successfulTx = results.find(r => r.status === 'fulfilled' && r.value);

    if (successfulTx && successfulTx.status === 'fulfilled' && successfulTx.value) {
      console.log(`\n✅✅✅ TOKEN RESCUE TX SENT: ${successfulTx.value}`);
      console.log(`🔍 Check: https://monad.explorer.caldera.xyz/tx/${successfulTx.value}`);

      try {
        const receipt = await publicClients[0].waitForTransactionReceipt({
          hash: successfulTx.value,
          timeout: 60000
        });

        if (receipt.status === 'success') {
          console.log(`\n🎉🎉🎉 ${tokenName} RESCUE SUCCESSFUL! 🎉🎉🎉`);
          return true;
        }
      } catch (e) {
        console.log('⚠️ Could not confirm receipt - check explorer.');
      }
    } else {
      console.log('❌ All token transfer attempts failed');
    }
  } catch (error: any) {
    console.error(`❌ Token sweep error: ${error.message}`);
  }
  return false;
}

async function checkAndRescue() {
  if (isTransferring || rescued) return;

  checkCount++;

  // Log status every 30 seconds
  if (Date.now() - lastLogTime > 30000) {
    console.log(`[${new Date().toISOString()}] Checks: ${checkCount} | Status: Actively monitoring...`);
    lastLogTime = Date.now();
  }

  try {
    // Check native MON balance
    const balanceResults = await Promise.all(
      publicClients.map(client =>
        client.getBalance({ address: COMPROMISED_ADDRESS }).catch(() => 0n)
      )
    );

    const balance = balanceResults.reduce((max, b) => b > max ? b : max, 0n);

    // Check if MON balance increased
    if (balance > lastMonBalance && balance > 0n) {
      console.log(`\n💰💰💰 BALANCE DETECTED: ${formatEther(balance)} MON 💰💰💰`);
      console.log(`[${new Date().toISOString()}] 🏃 RACING TO RESCUE...`);

      isTransferring = true;

      // Get gas price and calculate max amount
      const gasPrice = await publicClients[0].getGasPrice().catch(() => 1000000000n);
      const aggressiveGasPrice = gasPrice * GAS_MULTIPLIER;
      const gasLimit = 21000n;
      const gasCost = aggressiveGasPrice * gasLimit;
      const amountToSend = balance - gasCost;

      if (amountToSend <= 0n) {
        console.log('❌ Balance too low to cover gas');
        isTransferring = false;
        return;
      }

      console.log(`📤 Sending ${formatEther(amountToSend)} MON to ${SAFE_DESTINATION_ADDRESS}`);
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
          console.log(`TX attempt failed: ${e.message?.slice(0, 100)}`);
          return null;
        })
      );

      const results = await Promise.allSettled(txPromises);
      const successfulTx = results.find(r => r.status === 'fulfilled' && r.value);

      if (successfulTx && successfulTx.status === 'fulfilled' && successfulTx.value) {
        console.log(`\n✅✅✅ RESCUE TX SENT: ${successfulTx.value}`);
        console.log(`🔍 Check: https://monad.explorer.caldera.xyz/tx/${successfulTx.value}`);

        // Wait for confirmation
        try {
          const receipt = await publicClients[0].waitForTransactionReceipt({
            hash: successfulTx.value,
            timeout: 60000
          });

          if (receipt.status === 'success') {
            console.log('\n🎉🎉🎉 RESCUE SUCCESSFUL! MON SAVED! 🎉🎉🎉');
            console.log(`[${new Date().toISOString()}] Total checks before rescue: ${checkCount}`);
            rescued = true;
          } else {
            console.log('❌ Transaction failed on-chain - continuing to monitor');
          }
        } catch (e) {
          console.log('⚠️ Could not confirm receipt - check explorer. Continuing to monitor...');
        }
      } else {
        console.log('❌ All transfer attempts failed - continuing to monitor');
      }

      isTransferring = false;
    }

    lastMonBalance = balance;

    // Check ERC-20 token balances
    for (const token of TOKENS_TO_MONITOR) {
      try {
        const tokenBalance = await publicClients[0].readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [COMPROMISED_ADDRESS],
        }) as bigint;

        const lastBalance = lastTokenBalances.get(token.address) || 0n;

        // Check if token balance increased
        if (tokenBalance > lastBalance && tokenBalance > 0n) {
          const increase = tokenBalance - lastBalance;
          console.log(`\n💰💰💰 ${token.name} DETECTED: ${formatEther(increase)} tokens 💰💰💰`);
          console.log(`[${new Date().toISOString()}] 🏃 RACING TO RESCUE ${token.name}...`);

          isTransferring = true;
          const success = await sweepToken(token.address, token.name, tokenBalance);
          isTransferring = false;

          if (success) {
            console.log(`[${new Date().toISOString()}] Total checks before rescue: ${checkCount}`);
          }
        }

        lastTokenBalances.set(token.address, tokenBalance);
      } catch (error: any) {
        // Continue checking other tokens
      }
    }
  } catch (error) {
    // Silently continue polling
  }
}

// Run aggressive polling
setInterval(checkAndRescue, POLL_INTERVAL_MS);

// Run immediately
checkAndRescue();

// Keep process alive and log heartbeat
setInterval(() => {
  if (!rescued) {
    console.log(`[${new Date().toISOString()}] 💓 Heartbeat - Service running. Checks: ${checkCount}`);
  }
}, 300000); // Every 5 minutes

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log(`\n[${new Date().toISOString()}] ⏹️ Received SIGTERM - shutting down`);
  console.log(`Total checks performed: ${checkCount}`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`\n[${new Date().toISOString()}] ⏹️ Received SIGINT - shutting down`);
  console.log(`Total checks performed: ${checkCount}`);
  process.exit(0);
});

console.log('✅ Service initialized and running 24/7\n');
