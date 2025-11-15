/**
 * One-time script to approve YieldStrategy contract for max TOURS tokens
 * This allows staking without needing approve in every transaction
 */

import { sendSafeTransaction } from '../lib/pimlico-safe-aa.ts';
import { encodeFunctionData, parseAbi, maxUint256 } from 'viem';
import dotenv from 'dotenv';

dotenv.config();

const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN;
const YIELD_STRATEGY = '0xe3d8E4358aD401F857100aB05747Ed91e78D6913'; // V4

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
      }),
    },
  ];

  try {
    const txHash = await sendSafeTransaction(calls);
    console.log('✅ Max approval successful!');
    console.log('   Transaction:', txHash);
    console.log('   Explorer:', `https://explorer.monad.xyz/tx/${txHash}`);
    console.log('');
    console.log('🎉 Safe can now stake TOURS without approve calls!');
  } catch (error) {
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
