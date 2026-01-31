import { NextRequest, NextResponse } from 'next/server';
import { compileAndScan, validateContract } from '@/lib/compile';

export async function POST(req: NextRequest) {
  try {
    const { contracts, proposalId } = await req.json();

    if (!contracts || typeof contracts !== 'object' || Object.keys(contracts).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No contracts provided. Expected { "Filename.sol": "source code" }' },
        { status: 400 }
      );
    }

    console.log('[DevStudio] Compile request:', { files: Object.keys(contracts), proposalId });

    // Validate each contract before compilation
    const validationErrors: string[] = [];
    for (const [filename, source] of Object.entries(contracts)) {
      const validation = validateContract(source as string);
      if (!validation.valid) {
        validationErrors.push(`${filename}: ${validation.errors.join(', ')}`);
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    // Use compileAndScan for full security pipeline
    const result = compileAndScan(contracts as Record<string, string>);

    return NextResponse.json({
      success: true,
      contracts: result.contracts,
      warnings: result.warnings.length,
      securityReport: {
        source: result.sourceReport,
        bytecode: result.bytecodeReport,
      },
      integrityHashes: result.integrityHashes,
      securityScore: result.securityScore,
      proposalId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[DevStudio] Compile error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Compilation failed' },
      { status: 500 }
    );
  }
}
