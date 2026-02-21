import { NextRequest } from 'next/server';

const EC2_API = process.env.REMIX_DAW_EC2_URL || 'http://18.190.218.92:8000';

/**
 * Freestyle SSE proxy — streams Server-Sent Events from the EC2 backend
 * directly to the browser. Each 'bar' event contains a base64-encoded WAV
 * chunk for one lyric line, scheduled to play at a specific beat offset.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.jobId) {
    return new Response(JSON.stringify({ error: 'jobId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ec2Res = await fetch(`${EC2_API}/freestyle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // No timeout — this is a long-lived SSE stream
  });

  if (!ec2Res.ok) {
    const err = await ec2Res.text();
    return new Response(JSON.stringify({ error: err }), {
      status: ec2Res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Pipe the SSE stream straight through to the client
  return new Response(ec2Res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
