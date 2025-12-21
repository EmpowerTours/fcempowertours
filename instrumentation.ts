/**
 * Next.js Instrumentation Hook
 * This file runs once when the Next.js server starts
 * Perfect for initializing server-side services like cron jobs
 */

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startGameScheduler } = await import('./lib/game-scheduler');
    startGameScheduler();
  }
}
