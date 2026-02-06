import cron from 'node-cron';
import { createServer } from 'node:http';

const APP_URL = process.env.APP_URL || 'https://fcempowertours.up.railway.app';
const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const COINFLIP_SECRET = process.env.COINFLIP_SECRET || process.env.KEEPER_SECRET || '';
const PORT = process.env.PORT || 8081;

console.log('[CronService] Starting radio & coinflip scheduler cron...');
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

// Run every 30 seconds (radio scheduler)
cron.schedule('*/30 * * * * *', () => {
  callScheduler();
});

// Initial call on startup
callScheduler();

console.log('[CronService] Radio scheduler - running every 30 seconds');

// ============ COINFLIP AUTOMATION ============

async function checkCoinflipRound() {
  try {
    const response = await fetch(`${APP_URL}/api/coinflip/round`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[CronService] Failed to check coinflip round:', error.message);
    return null;
  }
}

async function executeCoinflipRound() {
  try {
    console.log(`[CronService] ${new Date().toISOString()} - Executing coinflip round...`);

    const response = await fetch(`${APP_URL}/api/coinflip/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': COINFLIP_SECRET,
      },
      body: JSON.stringify({ action: 'execute' }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[CronService] Coinflip round executed! Result: ${data.result}, Winners: ${data.winners?.length || 0}`);
    } else {
      console.error('[CronService] Coinflip execute error:', data.error);
    }

    return data;
  } catch (error) {
    console.error('[CronService] Failed to execute coinflip:', error.message);
    return null;
  }
}

async function startNewCoinflipRound() {
  try {
    console.log(`[CronService] ${new Date().toISOString()} - Starting new coinflip round...`);

    const response = await fetch(`${APP_URL}/api/coinflip/round`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': COINFLIP_SECRET,
      },
      body: JSON.stringify({ action: 'start' }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[CronService] New coinflip round started: ${data.roundId}`);
    } else {
      console.error('[CronService] Failed to start new round:', data.error);
    }

    return data;
  } catch (error) {
    console.error('[CronService] Failed to start new round:', error.message);
    return null;
  }
}

async function triggerAgentPredictions() {
  try {
    console.log(`[CronService] ${new Date().toISOString()} - Triggering agent predictions...`);

    const response = await fetch(`${APP_URL}/api/coinflip/agents/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': COINFLIP_SECRET,
      },
    });

    const data = await response.json();

    if (data.success) {
      console.log(`[CronService] Agent predictions: ${data.predictions?.length || 0} agents bet`);
    }

    return data;
  } catch (error) {
    console.error('[CronService] Failed to trigger agent predictions:', error.message);
    return null;
  }
}

async function coinflipManager() {
  const roundData = await checkCoinflipRound();

  if (!roundData) return;

  const now = Date.now();
  const round = roundData.currentRound;

  if (!round) {
    // No active round - start a new one
    console.log('[CronService] No active coinflip round, starting new round...');
    await startNewCoinflipRound();
    // Wait a bit then trigger agent predictions
    setTimeout(() => triggerAgentPredictions(), 5000);
    return;
  }

  const timeLeft = round.closesAt - now;
  const bettingEnded = timeLeft <= 0;

  if (round.status === 'open' && bettingEnded) {
    // Betting window closed - execute the flip
    console.log('[CronService] Betting window closed, executing flip...');
    await executeCoinflipRound();
    // Start new round after execution
    setTimeout(() => startNewCoinflipRound(), 10000);
    setTimeout(() => triggerAgentPredictions(), 15000);
  } else if (round.status === 'open' && timeLeft > 50 * 60 * 1000) {
    // Early in round (first 5 min) - trigger predictions if not many bets
    const totalBets = (round.bets || []).length;
    if (totalBets < 3) {
      console.log(`[CronService] Early round with ${totalBets} bets, triggering agent predictions...`);
      await triggerAgentPredictions();
    }
  } else if (round.status === 'resolved') {
    // Round resolved but no new round started
    console.log('[CronService] Round resolved, starting new round...');
    await startNewCoinflipRound();
    setTimeout(() => triggerAgentPredictions(), 5000);
  }
}

// Run coinflip manager every 5 minutes
cron.schedule('*/5 * * * *', () => {
  coinflipManager();
});

// Run at the top of every hour (execute and start new rounds)
cron.schedule('0 * * * *', () => {
  console.log('[CronService] Hourly coinflip check...');
  coinflipManager();
});

// Initial coinflip check on startup
setTimeout(() => coinflipManager(), 10000);

console.log('[CronService] Coinflip manager - running every 5 minutes');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[CronService] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[CronService] Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});
