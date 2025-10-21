import { createPublicClient, createWalletClient, http, Address, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

export const bundlerClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

// Helper to create user operation
export async function createUserOperation(params: {
  sender: Address;
  callData: `0x${string}`;
  nonce?: bigint;
}) {
  const { sender, callData, nonce } = params;

  const userOpNonce = nonce ?? await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS,
    abi: [{
      inputs: [{ name: 'sender', type: 'address' }, { name: 'key', type: 'uint192' }],
      name: 'getNonce',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    }],
    functionName: 'getNonce',
    args: [sender, 0n],
  });

  return {
    sender,
    nonce: userOpNonce,
    initCode: '0x' as `0x${string}`,
    callData,
    callGasLimit: 500000n,
    verificationGasLimit: 500000n,
    preVerificationGas: 100000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: '0x' as `0x${string}`,
    signature: '0x' as `0x${string}`,
  };
}

// Helper to send user operation via Pimlico bundler
export async function sendUserOperation(userOp: any) {
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [userOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Pimlico error: ${data.error.message}`);
  }

  return data.result; // Returns userOpHash
}

// Helper to get user operation receipt
export async function getUserOperationReceipt(userOpHash: string) {
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

// Helper to estimate user operation gas
export async function estimateUserOperationGas(userOp: any) {
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_estimateUserOperationGas',
      params: [userOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Gas estimation error: ${data.error.message}`);
  }

  return data.result;
}
