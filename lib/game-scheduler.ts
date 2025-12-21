import cron from 'node-cron';

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-change-in-production';
const BASE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

let isSchedulerRunning = false;

/**
 * Autonomous Game Management Scheduler
 * Runs hourly to manage Beat Match and Country Collector games
 */
export function startGameScheduler() {
  if (isSchedulerRunning) {
    console.log('[Game Scheduler] Already running, skipping initialization');
    return;
  }

  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Game Scheduler] Running autonomous game management...');

    try {
      const response = await fetch(`${BASE_URL}/api/cron/manage-games`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[Game Scheduler] Success:', result);
      } else {
        const error = await response.text();
        console.error('[Game Scheduler] Failed:', response.status, error);
      }
    } catch (error) {
      console.error('[Game Scheduler] Error calling manage-games:', error);
    }
  });

  isSchedulerRunning = true;
  console.log('[Game Scheduler] Started - will run hourly at minute 0');

  // Optional: Run immediately on startup for testing
  // Uncomment the following lines if you want to run the job immediately when the app starts
  /*
  (async () => {
    console.log('[Game Scheduler] Running initial check on startup...');
    try {
      const response = await fetch(`${BASE_URL}/api/cron/manage-games`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      });
      if (response.ok) {
        console.log('[Game Scheduler] Initial check completed');
      }
    } catch (error) {
      console.error('[Game Scheduler] Initial check failed:', error);
    }
  })();
  */
}
