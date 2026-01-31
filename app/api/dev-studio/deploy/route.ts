import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import crypto from 'crypto';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_DAO_CONTRACT_FACTORY as Address;

export async function POST(req: NextRequest) {
  try {
    const { proposalId, bytecode, constructorArgs, ipfsCID, integrityHashes, securityScore } = await req.json();

    if (proposalId === undefined) {
      return NextResponse.json(
        { success: false, error: 'proposalId is required' },
        { status: 400 }
      );
    }

    if (!FACTORY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'DAO Contract Factory not configured' },
        { status: 500 }
      );
    }

    console.log('[DevStudio] Deploy request:', { proposalId, ipfsCID, hasIntegrityHashes: !!integrityHashes });

    // Verify bytecode hash matches if both bytecode and integrity hashes provided
    if (bytecode && integrityHashes?.bytecodeHash) {
      const normalizedBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
      const computedHash = '0x' + crypto.createHash('sha256').update(normalizedBytecode).digest('hex');
      if (computedHash !== integrityHashes.bytecodeHash) {
        return NextResponse.json(
          { success: false, error: 'Bytecode SHA-256 hash mismatch — bytecode may have been tampered with' },
          { status: 422 }
        );
      }
    }

    // This route is for the backend operator to prepare data in the factory.
    // Actual deployment happens through Timelock governance.
    const calls: Array<{ to: Address; value: bigint; data: Hex }> = [];

    // Step 1: Set integrity hashes (if provided)
    if (integrityHashes?.sourceHash && integrityHashes?.bytecodeHash) {
      calls.push({
        to: FACTORY_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: [{
            inputs: [
              { name: 'id', type: 'uint256' },
              { name: 'sourceHash', type: 'bytes32' },
              { name: 'bytecodeHash', type: 'bytes32' },
            ],
            name: 'setIntegrityHashes',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          }],
          functionName: 'setIntegrityHashes',
          args: [BigInt(proposalId), integrityHashes.sourceHash as Hex, integrityHashes.bytecodeHash as Hex],
        }) as Hex,
      });
    }

    // Step 2: Set security score (if provided)
    if (securityScore !== undefined) {
      calls.push({
        to: FACTORY_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: [{
            inputs: [
              { name: 'id', type: 'uint256' },
              { name: 'score', type: 'uint256' },
            ],
            name: 'setSecurityScore',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          }],
          functionName: 'setSecurityScore',
          args: [BigInt(proposalId), BigInt(Math.min(100, Math.max(0, securityScore)))],
        }) as Hex,
      });
    }

    // Step 3: Set generated code on factory (if ipfsCID provided)
    if (ipfsCID) {
      calls.push({
        to: FACTORY_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: [{ inputs: [{ name: 'id', type: 'uint256' }, { name: 'ipfsCID', type: 'string' }], name: 'setGeneratedCode', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
          functionName: 'setGeneratedCode',
          args: [BigInt(proposalId), ipfsCID],
        }) as Hex,
      });
    }

    // Step 4: Set compiled bytecode (if provided)
    if (bytecode) {
      calls.push({
        to: FACTORY_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: [{ inputs: [{ name: 'id', type: 'uint256' }, { name: 'bytecode', type: 'bytes' }, { name: 'args', type: 'bytes' }], name: 'setCompiledBytecode', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
          functionName: 'setCompiledBytecode',
          args: [BigInt(proposalId), bytecode as Hex, (constructorArgs || '0x') as Hex],
        }) as Hex,
      });
    }

    if (calls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nothing to do — provide ipfsCID and/or bytecode' },
        { status: 400 }
      );
    }

    const txHash = await sendSafeTransaction(calls);
    console.log('[DevStudio] Deploy prep TX:', txHash);

    return NextResponse.json({
      success: true,
      txHash,
      proposalId,
      integrityHashes: integrityHashes || null,
      note: 'Data prepared in factory. Actual deployment requires Governor vote + Timelock execution.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[DevStudio] Deploy error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Deploy preparation failed' },
      { status: 500 }
    );
  }
}
