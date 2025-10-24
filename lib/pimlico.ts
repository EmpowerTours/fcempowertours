import { http, createPublicClient, Address, Hex } from 'viem';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL || 'https://api.pimlico.io/v1/monad-testnet/rpc';

// Helper: Convert BigInt to hex string
function toHex(value: bigint | undefined): Hex {
  if (value === undefined) return '0x0';
  if (typeof value === 'string') return value as Hex;
  return `0x${value.toString(16)}` as Hex;
}

// Helper: Convert UserOp with BigInts to proper hex format for JSON serialization
interface UserOpWithBigInt {
  sender: Address;
  nonce: bigint | string;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint | string;
  verificationGasLimit: bigint | string;
  preVerificationGas: bigint | string;
  maxFeePerGas: bigint | string;
  maxPriorityFeePerGas: bigint | string;
  paymasterAndData: Hex;
  signature: Hex;
}

interface UserOpForRPC {
  sender: Address;
  nonce: Hex;
  initCode: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

// Convert UserOp for RPC (all BigInts to hex)
function userOpToRPC(userOp: UserOpWithBigInt): UserOpForRPC {
  return {
    sender: userOp.sender,
    nonce: toHex(typeof userOp.nonce === 'bigint' ? userOp.nonce : BigInt(userOp.nonce)),
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: toHex(typeof userOp.callGasLimit === 'bigint' ? userOp.callGasLimit : BigInt(userOp.callGasLimit)),
    verificationGasLimit: toHex(typeof userOp.verificationGasLimit === 'bigint' ? userOp.verificationGasLimit : BigInt(userOp.verificationGasLimit)),
    preVerificationGas: toHex(typeof userOp.preVerificationGas === 'bigint' ? userOp.preVerificationGas : BigInt(userOp.preVerificationGas)),
    maxFeePerGas: toHex(typeof userOp.maxFeePerGas === 'bigint' ? userOp.maxFeePerGas : BigInt(userOp.maxFeePerGas)),
    maxPriorityFeePerGas: toHex(typeof userOp.maxPriorityFeePerGas === 'bigint' ? userOp.maxPriorityFeePerGas : BigInt(userOp.maxPriorityFeePerGas)),
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}

export async function sendUserOperation(userOp: UserOpWithBigInt): Promise<Hex> {
  try {
    console.log('📤 [Pimlico] Preparing UserOp for RPC...');
    
    // Convert all BigInts to hex strings for JSON serialization
    const userOpRPC = userOpToRPC(userOp);
    
    console.log('📤 [Pimlico] UserOp converted to RPC format');
    console.log('UserOp (RPC):', {
      sender: userOpRPC.sender,
      nonce: userOpRPC.nonce,
      callGasLimit: userOpRPC.callGasLimit,
      verificationGasLimit: userOpRPC.verificationGasLimit,
      preVerificationGas: userOpRPC.preVerificationGas,
      maxFeePerGas: userOpRPC.maxFeePerGas,
      maxPriorityFeePerGas: userOpRPC.maxPriorityFeePerGas,
    });

    const response = await fetch(PIMLICO_BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [userOpRPC, process.env.NEXT_PUBLIC_ENTRYPOINT || '0x5FF137D4b0FDCD49DcA30c7B57b04B0ee495b1C'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pimlico returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('❌ [Pimlico] RPC Error:', data.error);
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    const userOpHash = data.result as Hex;
    console.log('✅ [Pimlico] UserOp sent:', userOpHash);
    return userOpHash;
  } catch (error) {
    console.error('❌ [Pimlico] Failed to send UserOp:', error);
    throw error;
  }
}

export async function getUserOperationReceipt(userOpHash: Hex) {
  try {
    console.log('⏳ [Pimlico] Polling for receipt:', userOpHash);
    
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

    if (!response.ok) {
      throw new Error(`Pimlico returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('❌ [Pimlico] RPC Error:', data.error);
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    if (data.result) {
      console.log('✅ [Pimlico] Receipt found:', {
        transactionHash: data.result.receipt?.transactionHash,
        success: data.result.success,
      });
    }

    return data.result;
  } catch (error) {
    console.error('❌ [Pimlico] Failed to get receipt:', error);
    return null;
  }
}

export async function estimateUserOperationGas(userOp: UserOpForRPC) {
  try {
    console.log('⚡ [Pimlico] Estimating gas...');

    const response = await fetch(PIMLICO_BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_estimateUserOperationGas',
        params: [userOp, process.env.NEXT_PUBLIC_ENTRYPOINT || '0x5FF137D4b0FDCD49DcA30c7B57b04B0ee495b1C'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pimlico returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('❌ [Pimlico] Gas estimation error:', data.error);
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    console.log('✅ [Pimlico] Gas estimate:', data.result);
    return data.result;
  } catch (error) {
    console.error('❌ [Pimlico] Gas estimation failed:', error);
    throw error;
  }
}

export async function createSafeUserOperation(params: {
  to: Address;
  value: bigint;
  data: Hex;
}): Promise<UserOpWithBigInt> {
  // This is a placeholder - in production, you'd use Safe SDK
  // For now, return a minimal UserOp structure
  
  const safeAddress = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;
  
  return {
    sender: safeAddress,
    nonce: 0n,
    initCode: '0x',
    callData: '0x', // Would be encoded SafeExec call in production
    callGasLimit: 150000n,
    verificationGasLimit: 150000n,
    preVerificationGas: 21000n,
    maxFeePerGas: 1000000000n, // 1 gwei
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS 
      ? (process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS as Hex)
      : '0x',
    signature: '0x',
  };
}
