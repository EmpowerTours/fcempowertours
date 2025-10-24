// lib/pimlico.ts
import { createPublicClient, http, Address, encodeFunctionData, Hex, isHex } from 'viem';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

// Validate
if (!PIMLICO_BUNDLER_URL) throw new Error('NEXT_PUBLIC_PIMLICO_BUNDLER_URL missing');
if (!ENTRYPOINT_ADDRESS || !isHex(ENTRYPOINT_ADDRESS)) throw new Error('Invalid NEXT_PUBLIC_ENTRYPOINT_ADDRESS');
if (!SAFE_ACCOUNT || !isHex(SAFE_ACCOUNT)) throw new Error('Invalid NEXT_PUBLIC_SAFE_ACCOUNT');

console.log('Using entrypoint:', ENTRYPOINT_ADDRESS);
console.log('Using Safe account:', SAFE_ACCOUNT);

export const bundlerClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// BigInt → Hex
function bigintToHex(value: bigint | undefined): Hex {
  if (value === undefined) return '0x0';
  return `0x${value.toString(16)}` as Hex;
}

// Convert to Pimlico v0.6 RPC format (Monad uses v0.6 EntryPoint)
function toRpcUserOp(userOp: any): any {
  return {
    sender: userOp.sender,
    nonce: bigintToHex(userOp.nonce),
    initCode: '0x',
    callData: userOp.callData,
    callGasLimit: bigintToHex(userOp.callGasLimit),
    verificationGasLimit: bigintToHex(userOp.verificationGasLimit),
    preVerificationGas: bigintToHex(userOp.preVerificationGas),
    maxFeePerGas: bigintToHex(userOp.maxFeePerGas),
    maxPriorityFeePerGas: bigintToHex(userOp.maxPriorityFeePerGas),
    paymasterAndData: '0x', // No paymaster on Monad testnet
    signature: userOp.signature || '0x',
  };
}

// Encode Safe execTransaction
export function encodeSafeExecTransaction(params: {
  to: Address;
  value: bigint;
  data: Hex;
  operation?: number;
}) {
  const { to, value, data, operation = 0 } = params;

  return encodeFunctionData({
    abi: [{
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'signatures', type: 'bytes' }
      ],
      name: 'execTransaction',
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'payable',
      type: 'function',
    }],
    functionName: 'execTransaction',
    args: [
      to,
      value,
      data,
      operation,
      0n, // safeTxGas
      0n, // baseGas
      0n, // gasPrice
      '0x0000000000000000000000000000000000000000' as Address,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x' as Hex
    ],
  });
}

// Create user operation with HIGH gas limits
export async function createSafeUserOperation(params: {
  to: Address;
  value: bigint;
  data: Hex;
}) {
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS,
    abi: [{
      inputs: [{ name: 'sender', type: 'address' }, { name: 'key', type: 'uint192' }],
      name: 'getNonce',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    }],
    functionName: 'getNonce',
    args: [SAFE_ACCOUNT, 0n],
  });

  const callData = encodeSafeExecTransaction(params);

  console.log('📝 Creating UserOp with high gas limits for Safe NFT minting...');

  return {
    sender: SAFE_ACCOUNT,
    nonce,
    initCode: '0x' as Hex,
    callData,
    callGasLimit: 3_000_000n,
    verificationGasLimit: 2_000_000n,
    preVerificationGas: 500_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };
}

// Estimate gas
export async function estimateUserOperationGas(userOp: any) {
  const rpcUserOp = toRpcUserOp(userOp);
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_estimateUserOperationGas',
      params: [rpcUserOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Gas estimation error: ${data.error.message}`);
  return data.result;
}

// Send UserOp without paymaster (Safe pays for gas)
export async function sendUserOperation(userOp: any) {
  console.log('📤 Sending UserOp via Pimlico (no paymaster)...');
  const rpcUserOp = toRpcUserOp(userOp);

  console.log('📋 UserOp hex values:');
  console.log('  callGasLimit:', rpcUserOp.callGasLimit);
  console.log('  verificationGasLimit:', rpcUserOp.verificationGasLimit);
  console.log('  preVerificationGas:', rpcUserOp.preVerificationGas);
  console.log('  maxFeePerGas:', rpcUserOp.maxFeePerGas);

  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [rpcUserOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const data = await response.json();
  console.log('📬 Bundler response:', JSON.stringify(data, null, 2));

  if (data.error) throw new Error(`Pimlico error: ${data.error.message}`);
  console.log('✅ UserOp hash:', data.result);
  return data.result;
}

// Get receipt
export async function getUserOperationReceipt(userOpHash: string) {
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getUserOperationReceipt',
      params: [userOpHash],
    }),
  });

  const data = await response.json();
  return data.result;
}
