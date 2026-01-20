import { NextRequest, NextResponse } from 'next/server';
import {
  fetchKintsuVaultAPY,
  fetchMONPrice,
  fetchETHPrice,
  batchFetchOracleData,
  checkOracleHealth,
} from '@/lib/switchboard/oracle-service';

/**
 * Switchboard Oracle API Endpoint
 * Provides real-time oracle data for yield tracking and price feeds
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';

    switch (type) {
      case 'apy':
        // Fetch Kintsu vault APY only
        const apy = await fetchKintsuVaultAPY();
        return NextResponse.json({
          success: true,
          data: {
            kintsuAPY: apy,
            apyPercent: (apy * 100).toFixed(2),
            source: 'switchboard',
            timestamp: Date.now(),
          },
        });

      case 'mon':
        // Fetch MON price only
        const monPrice = await fetchMONPrice();
        return NextResponse.json({
          success: true,
          data: {
            monPrice,
            currency: 'USD',
            source: 'switchboard',
            timestamp: Date.now(),
          },
        });

      case 'eth':
        // Fetch ETH price only
        const ethPrice = await fetchETHPrice();
        return NextResponse.json({
          success: true,
          data: {
            ethPrice,
            currency: 'USD',
            source: 'switchboard',
            timestamp: Date.now(),
          },
        });

      case 'health':
        // Check oracle service health
        const health = await checkOracleHealth();
        return NextResponse.json({
          success: true,
          data: health,
        });

      case 'all':
      default:
        // Fetch all oracle data
        const allData = await batchFetchOracleData();
        return NextResponse.json({
          success: true,
          data: {
            ...allData,
            apyPercent: (allData.kintsuAPY * 100).toFixed(2),
            source: 'switchboard',
            timestamp: Date.now(),
          },
        });
    }
  } catch (error: any) {
    console.error('[Oracle API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch oracle data',
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for custom oracle job simulation
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, jsonPath } = body;

    if (!url || !jsonPath) {
      return NextResponse.json(
        { success: false, error: 'Missing url or jsonPath' },
        { status: 400 }
      );
    }

    // Import dynamically to avoid build issues
    const { OracleJob } = await import('@switchboard-xyz/common');
    const { simulateOracleJobs } = await import('@/lib/switchboard/oracle-service');

    // Create custom oracle job
    const customJob = new OracleJob({
      tasks: [
        { httpTask: { url } },
        { jsonParseTask: { path: jsonPath } },
      ],
    });

    // Simulate the job
    const results = await simulateOracleJobs([customJob]);

    return NextResponse.json({
      success: true,
      data: {
        result: results[0] || null,
        url,
        jsonPath,
        timestamp: Date.now(),
      },
    });
  } catch (error: any) {
    console.error('[Oracle API] Custom job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to simulate oracle job',
      },
      { status: 500 }
    );
  }
}
