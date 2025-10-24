// lib/pimlico.ts
import { createPublicClient, http, Address, encodeFunctionData, Hex, isHex } from 'viem';
import { monadTestnet } from '@/app/chains';

const PIMLICO_BUNDLER_URL = process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL!;
const ENTRYPOINT_ADDRESS = process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS as Address;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------
if (!PIMLICO_BUNDLER_URL) throw new Error('NEXT_PUBLIC_PIMLICO_BUNDLER_URL missing');
if (!ENTRYPOINT_ADDRESS || !isHex(ENTRYPOINT_ADDRESS)) throw new Error('Invalid NEXT_PUBLIC_ENTRYPOINT_ADDRESS');
if (!SAFE_ACCOUNT || !isHex(SAFE_ACCOUNT)) throw new Error('Invalid NEXT_PUBLIC_SAFE_ACCOUNT');

console.log('Using entrypoint:', ENTRYPOINT_ADDRESS);

// ---------------------------------------------------------------------
// Public / Bundler clients
// ---------------------------------------------------------------------
export const bundlerClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_BUNDLER_URL),
});

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC),
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function bigintToHex(value: bigint | undefined): Hex {
  if (value === undefined) return '0x0';
  return `0x${value.toString(16)}` as Hex;
}

// Convert internal UserOp (v0.6 style) → v0.7 RPC shape
function toRpcUserOp(userOp: any): any {
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

    // v0.7 paymaster fields – will be filled by pm_sponsorUserOperation
    paymaster: undefined,
    paymasterVerificationGasLimit: undefined,
    paymasterPostOpGasLimit: undefined,
    paymasterData: undefined,

    signature: userOp.signature || '0x',
  };
}

// ---------------------------------------------------------------------
// Encode Safe execTransaction
// ---------------------------------------------------------------------
export function encodeSafeExecTransaction(params: {
  to: Address;
  value: bigint;
  data: Hex;
  operation?: number;
}) {
  const { to, value, data, operation = 0 } = params;

  return encodeFunctionData({
    abi: [
      {
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
          { name: 'signatures', type: 'bytes' },
        ],
        name: 'execTransaction',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
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
      '0x' as Hex,
    ],
  });
}

// ---------------------------------------------------------------------
// Create UserOperation (v0.6 shape – will be converted to v0.7 later)
// ---------------------------------------------------------------------
export async function createSafeUserOperation(params: {
  to: Address;
  value: bigint;
  data: Hex;
}) {
  // v0.6 nonce (key is uint192)
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS,
    abi: [
      {
        inputs: [
          { name: 'sender', type: 'address' },
          { name: 'key', type: 'uint192' },
        ],
        name: 'getNonce',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'getNonce',
    args: [SAFE_ACCOUNT, 0n],
  });

  const callData = encodeSafeExecTransaction(params);

  return {
    sender: SAFE_ACCOUNT,
    nonce,
    initCode: '0x' as Hex,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    paymasterAndData: '0x' as Hex, // placeholder
    signature: '0x' as Hex,
  };
}

// ---------------------------------------------------------------------
// Estimate gas
// ---------------------------------------------------------------------
export async function estimateUserOperationGas(userOp: any) {
  const rpcOp = toRpcUserOp(userOp);

  const res = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_estimateUserOperationGas',
      params: [rpcOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Gas estimation error: ${data.error.message}`);
  return data.result;
}

// ---------------------------------------------------------------------
// Send UserOperation (adds paymaster, sends v0.7)
// ---------------------------------------------------------------------
export async function sendUserOperation(userOp: any) {
  console.log('Sending UserOp via Pimlico...');

  const rpcOp = toRpcUserOp(userOp);

  // ---------- Paymaster ----------
  const paymasterUrl = PIMLICO_BUNDLER_URL.replace('/rpc', '/paymaster/rpc');
  try {
    const pmRes = await fetch(paymasterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pm_sponsorUserOperation',
        params: [rpcOp, ENTRYPOINT_ADDRESS],
      }),
    });
    const pmData = await pmRes.json();

    if (pmData.result?.paymasterAndData) {
      const { paymasterAndData } = pmData.result;
      // paymasterAndData = address(20) + verificationGasLimit(16) + postOpGasLimit(16) + data(...)
      const paymaster = `0x${paymasterAndData.slice(2, 42)}` as Address;
      const verification = BigInt(`0x${paymasterAndData.slice(42, 74)}`);
      const postOp = BigInt(`0x${paymasterAndData.slice(74, 106)}`);
      const dataHex = `0x${paymasterAndData.slice(106)}` as Hex;

      rpcOp.paymaster = paymaster;
      rpcOp.paymasterVerificationGasLimit = bigintToHex(verification);
      rpcOp.paymasterPostOpGasLimit = bigintToHex(postOp);
      rpcOp.paymasterData = dataHex;

      console.log('Paymaster added:', paymaster);
    } else {
      console.warn('Paymaster failed:', pmData.error?.message);
    }
  } catch (e) {
    console.warn('Paymaster unavailable (continuing without):', e);
  }

  // ---------- Send ----------
  const sendRes = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [rpcOp, ENTRYPOINT_ADDRESS],
    }),
  });

  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(`Pimlico error: ${sendData.error.message}`);

  console.log('UserOp hash:', sendData.result);
  return sendData.result;
}

// ---------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------
export async function getUserOperationReceipt(userOpHash: string) {
  const res = await fetch(PIMLICO_BUNDLER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getUserOperationReceipt',
      params: [userOpHash],
    }),
  });

  const data = await res.json();
  return data.result;
}
