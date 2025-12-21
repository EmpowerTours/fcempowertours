import { NextResponse } from 'next/server';
import { createDefaultMetadataKeyInterceptor, getSSLHubRpcClient, HubEventType } from '@farcaster/hub-nodejs';

const hubRpcEndpoint = 'hub-grpc-api.neynar.com';

export async function GET() {
  try {
    const client = getSSLHubRpcClient(hubRpcEndpoint, {
      interceptors: [
        createDefaultMetadataKeyInterceptor('x-api-key', process.env.NEXT_PUBLIC_NEYNAR_API_KEY!),
      ],
      'grpc.max_receive_message_length': 20 * 1024 * 1024,
    });

    await new Promise((resolve, reject) => {
      client.$.waitForReady(Date.now() + 5000, (e) => {
        if (e) {
          console.error(`Failed to connect to ${hubRpcEndpoint}:`, e);
          reject(e);
        } else {
          console.log(`Connected to ${hubRpcEndpoint}`);
          resolve(null);
        }
      });
    });

    const subscribeResult = await client.subscribe({
      eventTypes: [HubEventType.MERGE_MESSAGE],
    });

    if (subscribeResult.isErr()) {
      throw new Error(`Subscription failed: ${subscribeResult.error.message}`);
    }

    const stream = subscribeResult.value;
    const casts: any[] = [];
    let count = 0;

    for await (const event of stream) {
      if (event.mergeMessageBody?.message?.data?.type === 1) {
        casts.push({
          text: String(event.mergeMessageBody.message.data.castAddBody.text || ''),
          author: { username: String(event.mergeMessageBody.message.data.fid || 'Unknown') },
          hash: String(event.mergeMessageBody.message.hash || ''),
        });
        count++;
        if (count >= 10) break; // Limit to 10 casts
      }
    }

    client.close();
    return NextResponse.json({ casts });
  } catch (error) {
    console.error('Farcaster hub streaming error:', error);
    return NextResponse.json({ error: 'Failed to fetch casts', casts: [] }, { status: 500 });
  }
}
