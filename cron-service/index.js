import cron from 'node-cron';

const APP_URL = process.env.APP_URL || 'https://fcempowertours.up.railway.app';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';

console.log('[CronService] Starting radio scheduler cron...');
console.log('[CronService] APP_URL:', APP_URL);

async function callScheduler() {
  try {
    const response = await fetch(`${APP_URL}/api/live-radio/scheduler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: KEEPER_SECRET }),
    });

    const data = await response.json();

    if (data.success) {
      if (data.action && data.action !== 'none') {
        console.log(`[CronService] ${new Date().toISOString()} - Action: ${data.action}`, data.details?.song?.name || data.details?.voiceNote?.id || '');
      }
    } else {
      console.error('[CronService] Scheduler error:', data.error);
    }
  } catch (error) {
    console.error('[CronService] Failed to call scheduler:', error.message);
  }
}

// Run every 30 seconds
cron.schedule('*/30 * * * * *', () => {
  callScheduler();
});

// Initial call on startup
callScheduler();

console.log('[CronService] Cron job scheduled - running every 30 seconds');

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('[CronService] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[CronService] Received SIGINT, shutting down...');
  process.exit(0);
});
