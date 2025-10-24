import { createPublicClient, http, Address, encodeFunctionData, Hex, isHex } from 'viem';
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from '@pimlico/bundler';
import { monadTestnet } from '@/app/chains';

// === CONFIG ===
const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

if (!PIMLICO_BUNDLER_URL) throw new Error('Missing PIMLICO_BUNDLER_URL');
if (!PIMLICO_API_KEY) throw new Error('Missing PIMLICO_API_KEY');
if (!ENTRYPOINT_ADDRESS || !isHex(ENTRYPOINT_ADDRESS)) throw new Error('Invalid ENTRYPOINT');
if (!SAFE_ACCOUNT || !isHex(SAFE_ACCOUNT)) throw new Error('Invalid SAFE_ACCOUNT');

console.log('Using ENTRYPOINT:', ENTRYPOINT_ADDRESS);

// === CLIENTS ===
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

export const bundlerClient = createPimlicoBundlerClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

export const paymasterClient = createPimlicoPaymasterClient({
  chain: monadTestnet,
  apiKey: PIMLICO_API_KEY,
});

// === ENCODE SAFE CALL ===
export function encodeSafeExecTransaction(params: {
  to: Address;
  value: bigint;
  data: Hex;
}) {
  const { to, value, data } = params;

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
      0, // operation
      0n, 0n, 0n,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x' as Hex
    ],
  });
}

// === CREATE USER OP (v0.7) ===
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
    factory: undefined,
    factoryData: undefined,
    callData,
    callGasLimit: 300_000n,
    verificationGasLimit: 150_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    paymaster: undefined,
    paymasterVerificationGasLimit: undefined,
    paymasterPostOpGasLimit: undefined,
    paymasterData: undefined,
    signature: '0x', // Delegated
  };
}

// === SDK WRAPPERS ===
export async function estimateUserOperationGas(userOp: any) {
  return bundlerClient.estimateUserOperationGas({
    userOperation: userOp,
    entryPoint: ENTRYPOINT_ADDRESS,
  });
}

export async function sendUserOperation(userOp: any) {
  const { paymasterAndData } = await paymasterClient.getPaymasterAndData({
    userOperation: userOp,
    entryPoint: ENTRYPOINT_ADDRESS,
  });

  const sponsoredUserOp = { ...userOp, paymasterAndData };

  return bundlerClient.sendUserOperation({
    userOperation: sponsoredUserOp,
    entryPoint: ENTRYPOINT_ADDRESS,
  });
}

export async function getUserOperationReceipt(hash: Hex) {
  return bundlerClient.getUserOperationReceipt({
    hash,
    entryPoint: ENTRYPOINT_ADDRESS,
  });
}
