import dotenv from 'dotenv';
import { setupScheduler } from './scheduler';
import logger from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
  logger.info('🤖 Keeper Bot starting...');

  // Validate required environment variables
  const requiredEnvVars = [
    'RPC_URL',
    'PLATFORM_SAFE_KEY',
    'MUSIC_BEAT_MATCH',
    'COUNTRY_COLLECTOR',
    'ENVIO_ENDPOINT',
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    logger.error('Please check your .env file');
    process.exit(1);
  }

  // Setup scheduler
  setupScheduler();

  logger.info('✅ Keeper Bot is running and waiting for scheduled tasks');
  logger.info('Press Ctrl+C to stop');

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Keeper Bot shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Keeper Bot shutting down...');
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Fatal error:', { error: error.message });
  process.exit(1);
});
