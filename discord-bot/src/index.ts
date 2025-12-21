import {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Interaction,
} from 'discord.js';
import config from './config';
import { blockchain } from './services/blockchain';
import { database } from './services/database';
import { roles } from './services/roles';

// Import commands
import * as tipCommand from './commands/tip';
import * as balanceCommand from './commands/balance';
import * as verifyFarcasterCommand from './commands/verify-farcaster';
import * as linkWalletCommand from './commands/link-wallet';
import * as claimCommand from './commands/claim';

// Command interface
interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// Extended client with commands collection
interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
}) as ExtendedClient;

// Initialize commands collection
client.commands = new Collection();

// Register commands
const commands: Command[] = [
  tipCommand,
  balanceCommand,
  verifyFarcasterCommand,
  linkWalletCommand,
  claimCommand,
];

// Add commands to collection
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// Ready event handler
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} guild(s)`);

  // Check Redis connection
  const redisHealthy = await database.ping();
  if (redisHealthy) {
    console.log('Redis connection healthy');
  } else {
    console.error('Redis connection failed - some features may not work');
  }

  // Initialize blockchain service
  try {
    await blockchain.initialize();
    const networkInfo = blockchain.getNetworkInfo();
    console.log(`Connected to ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);

    const tipPoolAddress = blockchain.getTipPoolAddress();
    if (tipPoolAddress) {
      const poolBalance = await blockchain.getTipPoolBalance();
      console.log(`Tip pool address: ${tipPoolAddress}`);
      console.log(`Tip pool balance: ${blockchain.formatBalance(poolBalance)} TOURS`);
    } else {
      console.warn('Warning: Tip pool not configured (TIP_POOL_PRIVATE_KEY missing)');
    }
  } catch (error) {
    console.error('Failed to initialize blockchain service:', error);
  }

  // Validate role configuration
  for (const guild of readyClient.guilds.cache.values()) {
    const validation = await roles.validateRoleConfiguration(guild);
    if (!validation.valid) {
      console.warn(`Role configuration issues in ${guild.name}:`);
      validation.errors.forEach(err => console.warn(`  - ${err}`));
    }
  }

  // Set bot status
  readyClient.user.setActivity('/tip to send TOURS', { type: 0 });
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);

    const errorMessage = {
      content: 'There was an error while executing this command!',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Member join handler - check if they have pending tips
client.on(Events.GuildMemberAdd, async (member) => {
  const user = await database.getUser(member.id);

  // If user has a linked wallet, update their roles
  if (user?.wallet_address) {
    try {
      await roles.updateMemberRoles(member);
    } catch (error) {
      console.error(`Failed to update roles for new member ${member.id}:`, error);
    }
  }

  // Check for pending tips and notify
  const pendingTips = await database.getTotalPendingTips(member.id);
  if (pendingTips > 0n) {
    try {
      await member.send({
        content: `Welcome! You have **${blockchain.formatBalance(pendingTips)} TOURS** in pending tips waiting for you. Link your wallet with \`/link-wallet\` to claim them!`,
      });
    } catch {
      // User has DMs disabled
    }
  }
});

// Periodic role update (every hour)
const ROLE_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  console.log('Starting periodic role update...');

  for (const guild of client.guilds.cache.values()) {
    try {
      const results = await roles.updateAllMemberRoles(guild);
      const changesCount = Array.from(results.values()).filter(
        r => r.added.length > 0 || r.removed.length > 0
      ).length;

      if (changesCount > 0) {
        console.log(`Updated roles for ${changesCount} member(s) in ${guild.name}`);
      }
    } catch (error) {
      console.error(`Error updating roles in ${guild.name}:`, error);
    }
  }
}, ROLE_UPDATE_INTERVAL);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await database.close();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await database.close();
  client.destroy();
  process.exit(0);
});

// Deploy commands function (can be called separately)
export async function deployCommands(): Promise<void> {
  try {
    config.validate();
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }

  const rest = new REST().setToken(config.discord.token);

  const commandsData = commands.map(cmd => cmd.data.toJSON());

  console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

  try {
    // Deploy to specific guild (faster for development)
    if (config.discord.guildId) {
      const data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commandsData }
      ) as unknown[];

      console.log(`Successfully reloaded ${data.length} guild commands.`);
    }

    // Also deploy globally (takes up to an hour to propagate)
    const globalData = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commandsData }
    ) as unknown[];

    console.log(`Successfully reloaded ${globalData.length} global commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
    throw error;
  }
}

// Start the bot
async function main(): Promise<void> {
  try {
    // Validate configuration
    config.validate();
    console.log('Configuration validated successfully');

    // Connect to Redis
    await database.connect();
    console.log('Database service initialized');

    // Login to Discord
    await client.login(config.discord.token);
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main();

export { client, commands };
