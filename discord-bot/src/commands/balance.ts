import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { Address } from 'viem';
import { blockchain } from '../services/blockchain';
import { database } from '../services/database';
import { roles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your TOURS token balance and tier status')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Check another user\'s balance (if their wallet is linked)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user') || interaction.user;
  const isOwnBalance = targetUser.id === interaction.user.id;

  // Get user's linked wallet
  const user = await database.getUser(targetUser.id);

  if (!user?.wallet_address) {
    if (isOwnBalance) {
      // Check for pending tips
      const pendingTips = await database.getTotalPendingTips(targetUser.id);
      const pendingEmbed = new EmbedBuilder()
        .setColor(0xffff00)
        .setTitle('Wallet Not Linked')
        .setDescription('You need to link your wallet to check your balance. Use `/link-wallet` to get started.');

      if (pendingTips > 0n) {
        pendingEmbed.addFields({
          name: 'Pending Tips',
          value: `You have **${blockchain.formatBalance(pendingTips)} TOURS** in pending tips waiting to be claimed!`,
        });
      }

      await interaction.editReply({ embeds: [pendingEmbed] });
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Wallet Not Found')
            .setDescription(`${targetUser.username} hasn't linked their wallet yet.`),
        ],
      });
    }
    return;
  }

  try {
    // Get TOURS balance
    const balance = await blockchain.getBalance(user.wallet_address as Address);
    const formattedBalance = blockchain.formatBalance(balance);

    // Get native balance (MON)
    const nativeBalance = await blockchain.getNativeBalance(user.wallet_address as Address);
    const formattedNativeBalance = (Number(nativeBalance) / 1e18).toFixed(4);

    // Get tier info
    const tier = roles.getTierForBalance(balance);
    const nextTier = roles.getNextTier(balance);

    // Get pending tips (only for own balance)
    let pendingTips = 0n;
    if (isOwnBalance) {
      pendingTips = await database.getTotalPendingTips(targetUser.id);
    }

    // Get tip statistics
    const tipsReceived = await database.getTipsReceived(targetUser.id);
    const tipsSent = await database.getTipsSent(targetUser.id);

    const totalReceived = tipsReceived
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + BigInt(t.amount), 0n);

    const totalSent = tipsSent
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + BigInt(t.amount), 0n);

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(tier === 'GOLD' ? 0xffd700 : tier === 'SILVER' ? 0xc0c0c0 : tier === 'BRONZE' ? 0xcd7f32 : 0x5865f2)
      .setTitle(`${isOwnBalance ? 'Your' : `${targetUser.username}'s`} TOURS Balance`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        {
          name: 'TOURS Balance',
          value: `**${formattedBalance}** TOURS`,
          inline: true,
        },
        {
          name: 'MON Balance',
          value: `**${formattedNativeBalance}** MON`,
          inline: true,
        },
        {
          name: 'Current Tier',
          value: roles.formatTierDisplay(tier),
          inline: true,
        }
      )
      .setTimestamp();

    // Add pending tips if any
    if (pendingTips > 0n && isOwnBalance) {
      embed.addFields({
        name: 'Pending Tips',
        value: `**${blockchain.formatBalance(pendingTips)}** TOURS (use \`/claim\` to claim)`,
        inline: false,
      });
    }

    // Add next tier info
    if (nextTier) {
      embed.addFields({
        name: 'Next Tier',
        value: `**${roles.formatTierDisplay(nextTier.tier)}** - Need ${nextTier.tokensNeeded.toString()} more TOURS`,
        inline: false,
      });
    }

    // Add tip statistics
    if (tipsReceived.length > 0 || tipsSent.length > 0) {
      embed.addFields({
        name: 'Tip Statistics',
        value: [
          `Received: **${blockchain.formatBalance(totalReceived)}** TOURS (${tipsReceived.length} tips)`,
          `Sent: **${blockchain.formatBalance(totalSent)}** TOURS (${tipsSent.length} tips)`,
        ].join('\n'),
        inline: false,
      });
    }

    // Add wallet address (truncated)
    const truncatedAddress = `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`;
    embed.addFields({
      name: 'Wallet',
      value: `\`${truncatedAddress}\``,
      inline: true,
    });

    // Add network info
    const networkInfo = blockchain.getNetworkInfo();
    embed.setFooter({
      text: `Network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`,
    });

    // Add Farcaster info if linked
    if (user.farcaster_username) {
      embed.addFields({
        name: 'Farcaster',
        value: `@${user.farcaster_username}`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Balance check error:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('An error occurred while fetching your balance. Please try again later.'),
      ],
    });
  }
}
