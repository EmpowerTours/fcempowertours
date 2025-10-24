import { createPublicClient, http, Address, encodeFunctionData, Hex, isHex } from 'viem';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

if (!PIMLICO_BUNDLER_URL) throw new Error('Missing PIMLICO_BUNDLER_URL');
if (!ENTRYPOINT_ADDRESS || !isHex(ENTRYPOINT_ADDRESS)) throw new Error('Invalid ENTRYPOINT');
if (!SAFE_ACCOUNT || !isHex(SAFE_ACCOUNT)) throw new Error('Invalid SAFE_ACCOUNT');

console.log('Using ENTRYPOINT:', ENTRYPOINT_ADDRESS);

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// === BigInt → Hex ===
function bigintToHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

// === v0.7 UserOp Converter ===
function userOpToRPC(userOp: any): any {
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

// === Encode Safe execTransaction ===
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
      0,
      0n, 0n, 0n,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x0000000000000000000000000000000000000000' as Address,
      '0x' as Hex
    ],
  });
}

// === Create UserOp ===
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
    callGasLimit: 300_000n,
    verificationGasLimit: 150_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };
}

// === PIMLICO RPC ===
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
  if (data.error) throw new Error(`Pimlico: ${data.error.message}`);
  return data.result;
}

export async function sendUserOperation(userOp: any) {
  const rpcUserOp = userOpToRPC(userOp);

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
  if (data.error) throw new Error(`Pimlico: ${data.error.message}`);
  return data.result;
}

export async function getUserOperationReceipt(hash: string) {
  const response = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getUserOperationReceipt',
      params: [hash],
    }),
  });

  const data = await response.json();
  return data.result;
}
