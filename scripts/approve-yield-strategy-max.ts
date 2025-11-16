/**
 * One-time script to approve YieldStrategy contract for max TOURS tokens
 * This allows staking without needing approve in every transaction
 */

import { sendSafeTransaction } from '../lib/pimlico-safe-aa';
import { encodeFunctionData, parseAbi, maxUint256 } from 'viem';

const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as `0x${string}`;
const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974' as `0x${string}`;

async function approveYieldStrategyMax() {
  console.log('🔓 Approving YieldStrategy for max TOURS tokens...');
  console.log('   TOURS Token:', TOURS_TOKEN);
  console.log('   YieldStrategy:', YIELD_STRATEGY);
  console.log('   Approval Amount:', maxUint256.toString(), '(max uint256)');

  const calls = [
    {
      to: TOURS_TOKEN,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
        functionName: 'approve',
        args: [YIELD_STRATEGY, maxUint256],
      }) as `0x${string}`,
    },
  ];

  try {
    const txHash = await sendSafeTransaction(calls);
    console.log('✅ Max approval successful!');
    console.log('   Transaction:', txHash);
    console.log('   Explorer:', `https://testnet.monadscan.com/tx/${txHash}`);
    console.log('');
    console.log('🎉 Safe can now stake TOURS without approve calls!');
  } catch (error: any) {
    console.error('❌ Approval failed:', error.message);
    throw error;
  }
}

approveYieldStrategyMax()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
