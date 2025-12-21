import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config';

// Import command definitions
import * as tipCommand from './commands/tip';
import * as balanceCommand from './commands/balance';
import * as verifyFarcasterCommand from './commands/verify-farcaster';
import * as linkWalletCommand from './commands/link-wallet';
import * as claimCommand from './commands/claim';

interface Command {
  data: SlashCommandBuilder;
}

const commands: Command[] = [
  tipCommand,
  balanceCommand,
  verifyFarcasterCommand,
  linkWalletCommand,
  claimCommand,
];

async function deployCommands(): Promise<void> {
  // Validate required config
  if (!config.discord.token) {
    console.error('Error: DISCORD_TOKEN is required');
    process.exit(1);
  }

  if (!config.discord.clientId) {
    console.error('Error: DISCORD_CLIENT_ID is required');
    process.exit(1);
  }

  const rest = new REST().setToken(config.discord.token);

  const commandsData = commands.map(cmd => cmd.data.toJSON());

  console.log('');
  console.log('='.repeat(50));
  console.log('EmpowerTours Discord Bot - Command Deployment');
  console.log('='.repeat(50));
  console.log('');
  console.log(`Commands to deploy: ${commandsData.length}`);
  commandsData.forEach(cmd => console.log(`  - /${cmd.name}: ${cmd.description}`));
  console.log('');

  try {
    // Deploy to specific guild (instant, for development)
    if (config.discord.guildId) {
      console.log(`Deploying to guild: ${config.discord.guildId}`);

      const guildData = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commandsData }
      ) as unknown[];

      console.log(`Successfully deployed ${guildData.length} guild commands (instant)`);
    }

    // Deploy globally (takes up to 1 hour to propagate)
    console.log('');
    console.log('Deploying globally...');

    const globalData = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commandsData }
    ) as unknown[];

    console.log(`Successfully deployed ${globalData.length} global commands`);
    console.log('');
    console.log('Note: Global commands may take up to 1 hour to appear in all servers.');
    console.log('Guild commands are available immediately in the specified guild.');
    console.log('');
    console.log('='.repeat(50));
    console.log('Deployment complete!');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
}

// Delete all commands (useful for cleanup)
async function deleteAllCommands(): Promise<void> {
  if (!config.discord.token || !config.discord.clientId) {
    console.error('Error: DISCORD_TOKEN and DISCORD_CLIENT_ID are required');
    process.exit(1);
  }

  const rest = new REST().setToken(config.discord.token);

  console.log('Deleting all commands...');

  try {
    // Delete guild commands
    if (config.discord.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: [] }
      );
      console.log('Deleted all guild commands');
    }

    // Delete global commands
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: [] }
    );
    console.log('Deleted all global commands');
  } catch (error) {
    console.error('Error deleting commands:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--delete') || args.includes('-d')) {
  deleteAllCommands();
} else {
  deployCommands();
}
