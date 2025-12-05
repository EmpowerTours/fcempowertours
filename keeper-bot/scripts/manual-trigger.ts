import dotenv from 'dotenv';
import { createBeatMatchChallenge, createCollectorChallenge } from '../src/services/challengeService';
import logger from '../src/utils/logger';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'beat-match';

  logger.info(`Manually triggering: ${command}`);

  try {
    if (command === 'beat-match') {
      const result = await createBeatMatchChallenge();
      logger.info('Result:', result);
    } else if (command === 'collector') {
      const result = await createCollectorChallenge();
      logger.info('Result:', result);
    } else {
      logger.error(`Unknown command: ${command}`);
      logger.info('Usage: npm run manual-trigger [beat-match|collector]');
      process.exit(1);
    }

    logger.info('✅ Manual trigger completed successfully');
  } catch (error: any) {
    logger.error('❌ Manual trigger failed:', { error: error.message });
    process.exit(1);
  }
}

main();
