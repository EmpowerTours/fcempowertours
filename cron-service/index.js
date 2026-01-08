/**
 * Live Radio Cron Service
 *
 * Deploy as a separate Railway service to call the radio scheduler
 * every 5 seconds to advance playback.
 *
 * Environment Variables:
 * - APP_URL: Your main app URL (e.g., https://fcempowertours-production-6551.up.railway.app)
 * - KEEPER_SECRET: The secret key for authentication
 * - SCHEDULER_INTERVAL: Interval in ms (default: 5000)
 */

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const SCHEDULER_INTERVAL = parseInt(process.env.SCHEDULER_INTERVAL || '5000', 10);

console.log('🎵 Live Radio Cron Service Starting...');
console.log(`   App URL: ${APP_URL}`);
console.log(`   Interval: ${SCHEDULER_INTERVAL}ms`);

let isRunning = false;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

async function callScheduler() {
  if (isRunning) {
    console.log('⏳ Previous call still running, skipping...');
    return;
  }

  isRunning = true;

  try {
    const response = await fetch(`${APP_URL}/api/live-radio/scheduler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret: KEEPER_SECRET }),
    });

    const data = await response.json();

    if (data.success) {
      consecutiveErrors = 0;

      if (data.action && data.action !== 'none') {
        console.log(`🎵 [${new Date().toISOString()}] Action: ${data.action}`);

        if (data.details?.song) {
          console.log(`   Now playing: "${data.details.song.name}" ${data.details.isRandom ? '(random)' : '(queued)'}`);
        }
        if (data.details?.voiceNote) {
          console.log(`   Voice note from: ${data.details.voiceNote.username || data.details.voiceNote.submitter}`);
        }
      }
    } else {
      console.error(`❌ Scheduler error: ${data.error || data.message}`);
      consecutiveErrors++;
    }
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Failed to call scheduler:`, error.message);
    consecutiveErrors++;
  } finally {
    isRunning = false;
  }

  // If too many consecutive errors, slow down
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    console.log(`⚠️ Too many errors (${consecutiveErrors}), waiting 60 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 60000));
    consecutiveErrors = 0;
  }
}

// Health check endpoint
const http = require('http');
const PORT = process.env.PORT || 8081;

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'live-radio-cron',
      interval: SCHEDULER_INTERVAL,
      consecutiveErrors,
      timestamp: new Date().toISOString(),
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`✅ Health check server running on port ${PORT}`);
});

// Start the scheduler loop
async function startScheduler() {
  console.log('🚀 Starting scheduler loop...');

  // Initial call
  await callScheduler();

  // Set up interval
  setInterval(callScheduler, SCHEDULER_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down...');
  server.close();
  process.exit(0);
});

// Start!
startScheduler();
