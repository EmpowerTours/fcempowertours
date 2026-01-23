import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID!;
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;

const neynar = new NeynarAPIClient({
  apiKey: NEYNAR_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { txHash, amount, fromAddress, toAddress, username, fid } = await req.json();

    if (!txHash || !amount || !fromAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('📤 [SEND-MON-CALLBACK] Transaction completed:', {
      txHash,
      amount,
      fromAddress,
      toAddress,
      username,
      fid
    });

    // Create a cast about the transaction
    const explorerUrl = `https://monadscan.com/tx/${txHash}`;

    let castText = `✅ ${username ? `@${username}` : 'User'} sent ${amount} MON!\n\n`;
    castText += `View transaction:\n${explorerUrl}`;

    try {
      const cast = await neynar.publishCast({
        signerUuid: BOT_SIGNER_UUID,
        text: castText,
      });

      console.log('✅ [SEND-MON-CALLBACK] Bot cast published:', cast.cast?.hash);

      return NextResponse.json({
        success: true,
        castHash: cast.cast?.hash,
        message: 'Transaction recorded and cast published'
      });
    } catch (castError: any) {
      console.error('❌ [SEND-MON-CALLBACK] Failed to publish cast:', castError);
      return NextResponse.json({
        success: false,
        error: 'Failed to publish cast',
        details: castError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ [SEND-MON-CALLBACK] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
