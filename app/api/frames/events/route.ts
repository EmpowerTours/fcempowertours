import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const imageUrl = `${APP_URL}/api/og/events`;

  const frame = {
    version: 'vNext',
    image: imageUrl,
    buttons: [
      {
        label: 'View Events',
        action: 'link',
        target: `${APP_URL}/events`,
      },
      {
        label: 'Buy Ticket',
        action: 'post',
        target: `${APP_URL}/api/frames/events/buy`,
      },
      {
        label: 'Signal Demand',
        action: 'post',
        target: `${APP_URL}/api/frames/events/demand`,
      },
    ],
    input: {
      text: 'Enter Event ID',
    },
  };

  return NextResponse.json(frame);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { untrustedData } = body;
    const eventId = untrustedData?.inputText || '0';

    const imageUrl = `${APP_URL}/api/og/events?eventId=${eventId}`;

    const frame = {
      version: 'vNext',
      image: imageUrl,
      buttons: [
        {
          label: 'Confirm Purchase',
          action: 'tx',
          target: `${APP_URL}/api/frames/transaction/buy-ticket`,
          postUrl: `${APP_URL}/api/frames/events/success`,
        },
        {
          label: 'Back',
          action: 'post',
          target: `${APP_URL}/api/frames/events`,
        },
      ],
    };

    return NextResponse.json(frame);
  } catch (error) {
    console.error('Error in events frame:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
