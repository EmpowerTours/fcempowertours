import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const imageUrl = `${APP_URL}/api/og/staking`;

  const frame = {
    version: 'vNext',
    image: imageUrl,
    buttons: [
      {
        label: 'Stake TOURS',
        action: 'post',
        target: `${APP_URL}/api/frames/staking/stake`,
      },
      {
        label: 'View Stats',
        action: 'launch_frame',
        target: `${APP_URL}/staking`,
      },
      {
        label: 'Claim Rewards',
        action: 'tx',
        target: `${APP_URL}/api/frames/transaction/claim-rewards`,
        postUrl: `${APP_URL}/api/frames/staking/success`,
      },
    ],
  };

  return NextResponse.json(frame);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { untrustedData } = body;
    const amount = untrustedData?.inputText || '0';

    const imageUrl = `${APP_URL}/api/og/staking?amount=${amount}`;

    const frame = {
      version: 'vNext',
      image: imageUrl,
      buttons: [
        {
          label: `Stake ${amount} TOURS`,
          action: 'tx',
          target: `${APP_URL}/api/frames/transaction/stake-tours`,
          postUrl: `${APP_URL}/api/frames/staking/success`,
        },
        {
          label: 'Back',
          action: 'post',
          target: `${APP_URL}/api/frames/staking`,
        },
      ],
    };

    return NextResponse.json(frame);
  } catch (error) {
    console.error('Error in staking frame:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
