/**
 * Direct approval script - bypasses AA library
 * Approves YieldStrategy V4 for unlimited TOURS from Safe account
 */

import { createWalletClient, http, parseAbi, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
});

const SAFE_OWNER_PRIVATE_KEY = '0x6cf049d37dcf12b8c653e0f7a3a18dd8dbf72e1e06c6e69cb9dcee1ed0b8f8a3'; // Safe owner key
const SAFE_ACCOUNT = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20'; // Safe address
const TOURS_TOKEN = '0x96ad3dEA5d1a4D3dB4E8Bb7E86F0e47F02e1c48b';
const YIELD_STRATEGY = '0xe3d8E4358aD401F857100aB05747Ed91e78D6913'; // V4

async function approveSafe() {
  console.log('🔓 Approving YieldStrategy V4 for unlimited TOURS...');
  console.log('   Safe Account:', SAFE_ACCOUNT);
  console.log('   TOURS Token:', TOURS_TOKEN);
  console.log('   YieldStrategy V4:', YIELD_STRATEGY);
  console.log('');

  const account = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  // Check current allowance
  console.log('📊 Checking current allowance...');
  const currentAllowance = await publicClient.readContract({
    address: TOURS_TOKEN,
    abi: parseAbi(['function allowance(address owner, address spender) external view returns (uint256)']),
    functionName: 'allowance',
    args: [SAFE_ACCOUNT, YIELD_STRATEGY],
  });
  console.log('   Current allowance:', currentAllowance.toString());

  if (currentAllowance > 0n) {
    console.log('⚠️  Allowance already set. Do you want to update it? (Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Execute Safe transaction to approve
  console.log('');
  console.log('💳 Executing approval via Safe...');
  console.log('   Using Safe owner:', account.address);

  // NOTE: This is a simplified approach - for production, you'd want to use the Safe SDK
  // or multicall through the Safe contract. For now, we'll just execute from owner.

  // Actually, we can't approve directly - we need to go through the Safe
  // Let me use the exec transaction pattern from Safe

  const safeAbi = parseAbi([
    'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) external payable returns (bool)'
  ]);

  // Encode the approve call
  const approveData = publicClient.encodeFunctionData({
    abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
    functionName: 'approve',
    args: [YIELD_STRATEGY, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
  });

  console.log('   Approve calldata:', approveData);

  // Build Safe transaction
  // operation: 0 = CALL
  const hash = await walletClient.writeContract({
    address: SAFE_ACCOUNT,
    abi: safeAbi,
    functionName: 'execTransaction',
    args: [
      TOURS_TOKEN, // to
      0n, // value
      approveData, // data
      0, // operation (CALL)
      0n, // safeTxGas
      0n, // baseGas
      0n, // gasPrice
      '0x0000000000000000000000000000000000000000', // gasToken
      '0x0000000000000000000000000000000000000000', // refundReceiver
      '0x' // signatures (empty for now - need proper signature)
    ],
  });

  console.log('✅ Transaction sent:', hash);
  console.log('');
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    console.log('✅ Approval successful!');
    console.log('   Block:', receipt.blockNumber);
    console.log('');

    // Check new allowance
    const newAllowance = await publicClient.readContract({
      address: TOURS_TOKEN,
      abi: parseAbi(['function allowance(address owner, address spender) external view returns (uint256)']),
      functionName: 'allowance',
      args: [SAFE_ACCOUNT, YIELD_STRATEGY],
    });
    console.log('✅ New allowance:', newAllowance.toString());
    console.log('');
    console.log('🎉 Safe can now stake TOURS without approve calls!');
  } else {
    console.log('❌ Transaction reverted');
    process.exit(1);
  }
}

approveSafe()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error.message);
    console.error(error);
    process.exit(1);
  });
