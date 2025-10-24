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

// UserOp to RPC-safe v0.7 format
function userOpToRPC(userOp: any) {
  return {
    sender: userOp.sender,
    nonce: bigintToHex(userOp.nonce),
    factory: undefined,
    factoryData: undefined,
    callData: userOp.callData,
    callGasLimit: bigintToHex(userOp.callGasLimit),
    verificationGasLimit: bigintToHex(userOp.verificationGasLimit),
    preVerificationGas: bigintToHex(userOp.preVerificationGas),
    maxFeePerGas: bigintToHex(userOp.maxFeePerGas),
    maxPriorityFeePerGas: bigintToHex(userOp.maxPriorityFeePerGas),
    paymaster: undefined,
    paymasterVerificationGasLimit: undefined,
    paymasterPostOpGasLimit: undefined,
    paymasterData: undefined,
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
      0n,
      0n,
      0n,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x' as Hex
    ],
  });
}

// Create user operation for Safe
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
  
  return {
    sender: SAFE_ACCOUNT,
    nonce,
    initCode: '0x' as Hex,
    callData,
    callGasLimit: 500000n,
    verificationGasLimit: 500000n,
    preVerificationGas: 100000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };
}

// Estimate user operation gas
export async function estimateUserOperationGas(userOp: any) {
  const rpcUserOp = userOpToRPC(userOp);

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
  
  if (data.error) {
    throw new Error(`Gas estimation error: ${data.error.message}`);
  }
  
  return data.result;
}

// Send user operation via Pimlico
export async function sendUserOperation(userOp: any) {
  console.log('📤 Sending UserOp via Pimlico...');
  
  const rpcUserOp = userOpToRPC(userOp);

  // Add Pimlico paymaster (v0.7)
  const paymasterUrl = PIMLICO_BUNDLER_URL.replace('/rpc', '/paymaster/rpc');
  try {
    const paymasterResp = await fetch(paymasterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pm_sponsorUserOperation',
        params: [rpcUserOp, ENTRYPOINT_ADDRESS],
      }),
    });
    const paymasterData = await paymasterResp.json();

    if (paymasterData.result) {
      const { paymasterAndData } = paymasterData.result;
      const paymaster = `0x${paymasterAndData.slice(2, 42)}` as Address; // First 20 bytes
      const paymasterVerificationGasLimit = BigInt(`0x${paymasterAndData.slice(42, 74)}`);
      const paymasterPostOpGasLimit = BigInt(`0x${paymasterAndData.slice(74, 106)}`);
      const paymasterDataHex = `0x${paymasterAndData.slice(106)}` as Hex;

      rpcUserOp.paymaster = paymaster;
      rpcUserOp.paymasterVerificationGasLimit = bigintToHex(paymasterVerificationGasLimit);
      rpcUserOp.paymasterPostOpGasLimit = bigintToHex(paymasterPostOpGasLimit);
      rpcUserOp.paymasterData = paymasterDataHex;

      console.log('✅ Paymaster added:', paymaster);
    } else {
      console.warn('⚠️ Paymaster failed:', paymasterData.error?.message);
    }
  } catch (err) {
    console.warn('⚠️ Paymaster unavailable:', err);
  }

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
  
  if (data.error) throw new Error(`Pimlico error: ${data.error.message}`);
  
  console.log('✅ UserOp hash:', data.result);
  return data.result;
}

// Get user operation receipt
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
