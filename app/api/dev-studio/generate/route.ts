import { NextRequest, NextResponse } from 'next/server';
import { generateDApp, generateDAOContract } from '@/lib/claude';

export async function POST(req: NextRequest) {
  try {
    const { prompt, appType, options, proposalId } = await req.json();

    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Prompt must be at least 10 characters' },
        { status: 400 }
      );
    }

    console.log('[DevStudio] Generate request:', { appType, proposalId, promptLen: prompt.length });

    // DAO proposal contract generation (stricter security)
    if (proposalId !== undefined) {
      const result = await generateDAOContract(prompt, proposalId);

      // If security scan failed after retry, return 422
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: 'Security scan failed after retry — critical issues found',
          securityReport: result.securityReport,
          code: result.code,
          timestamp: new Date().toISOString(),
        }, { status: 422 });
      }

      return NextResponse.json({
        success: true,
        proposalId,
        code: result.code,
        securityReport: result.securityReport,
        timestamp: new Date().toISOString(),
      });
    }

    // Full dApp generation
    if (!appType) {
      return NextResponse.json(
        { success: false, error: 'App type is required', validTypes: ['VRF Game', 'NFT Platform', 'DeFi Protocol', 'DAO', 'Token', 'Custom'] },
        { status: 400 }
      );
    }

    const result = await generateDApp(prompt, appType, options);

    return NextResponse.json({
      success: true,
      code: result.code,
      metadata: result.metadata,
      cost: result.cost,
      timestamp: result.timestamp,
    });
  } catch (error: any) {
    console.error('[DevStudio] Generate error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Generation failed' },
      { status: 500 }
    );
  }
}
