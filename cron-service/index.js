import cron from 'node-cron';
import { createServer } from 'node:http';

const APP_URL = process.env.APP_URL || 'https://fcempowertours.up.railway.app';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const PORT = process.env.PORT || 8081;

console.log('[CronService] Starting radio scheduler cron...');
console.log('[CronService] APP_URL:', APP_URL);

// Health check server so Railway knows the service is alive
const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'cron-service', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[CronService] Health check server listening on port ${PORT}`);
});

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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[CronService] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[CronService] Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});
