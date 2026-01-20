import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const imageUrl = `${APP_URL}/api/og/tanda`;

  const frame = {
    version: 'vNext',
    image: imageUrl,
    buttons: [
      {
        label: 'Create Group',
        action: 'post',
        target: `${APP_URL}/api/frames/tanda/create`,
      },
      {
        label: 'Join Group',
        action: 'post',
        target: `${APP_URL}/api/frames/tanda/join`,
      },
      {
        label: 'View Groups',
        action: 'link',
        target: `${APP_URL}/tanda`,
      },
    ],
    input: {
      text: 'Enter Group ID to join',
    },
  };

  return NextResponse.json(frame);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { untrustedData } = body;
    const groupId = untrustedData?.inputText || '0';

    const imageUrl = `${APP_URL}/api/og/tanda?groupId=${groupId}`;

    const frame = {
      version: 'vNext',
      image: imageUrl,
      buttons: [
        {
          label: `Join Group #${groupId}`,
          action: 'tx',
          target: `${APP_URL}/api/frames/transaction/join-tanda`,
          postUrl: `${APP_URL}/api/frames/tanda/success`,
        },
        {
          label: 'Contribute',
          action: 'tx',
          target: `${APP_URL}/api/frames/transaction/contribute-tanda`,
          postUrl: `${APP_URL}/api/frames/tanda/success`,
        },
        {
          label: 'Back',
          action: 'post',
          target: `${APP_URL}/api/frames/tanda`,
        },
      ],
    };

    return NextResponse.json(frame);
  } catch (error) {
    console.error('Error in tanda frame:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
