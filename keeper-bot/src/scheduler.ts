import cron from 'node-cron';
import { createBeatMatchChallenge, createCollectorChallenge, finalizeExpiredChallenges } from './services/challengeService';
import logger from './utils/logger';

export function setupScheduler() {
  logger.info('Setting up scheduled tasks...');

  // Daily Music Beat Match challenge (default: midnight UTC)
  const beatMatchCron = process.env.BEAT_MATCH_CRON || '0 0 * * *';
  cron.schedule(beatMatchCron, async () => {
    logger.info('⏰ Scheduled: Creating daily Beat Match challenge');
    try {
      await createBeatMatchChallenge();
    } catch (error: any) {
      logger.error('Scheduled Beat Match creation failed', { error: error.message });
      // TODO: Send alert via Discord/Slack
    }
  });
  logger.info(`Beat Match scheduled: ${beatMatchCron}`);

  // Weekly Country Collector challenge (default: Sunday midnight UTC)
  const collectorCron = process.env.COLLECTOR_CRON || '0 0 * * 0';
  cron.schedule(collectorCron, async () => {
    logger.info('⏰ Scheduled: Creating weekly Collector challenge');
    try {
      await createCollectorChallenge();
    } catch (error: any) {
      logger.error('Scheduled Collector creation failed', { error: error.message });
      // TODO: Send alert
    }
  });
  logger.info(`Collector scheduled: ${collectorCron}`);

  // Hourly: Finalize expired challenges
  const finalizeCron = process.env.FINALIZE_CRON || '0 * * * *';
  cron.schedule(finalizeCron, async () => {
    logger.info('⏰ Scheduled: Checking for expired challenges');
    try {
      await finalizeExpiredChallenges();
    } catch (error: any) {
      logger.error('Challenge finalization failed', { error: error.message });
    }
  });
  logger.info(`Finalization scheduled: ${finalizeCron}`);

  logger.info('✅ All scheduled tasks configured');
}
