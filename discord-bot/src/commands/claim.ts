import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { Address } from 'viem';
import config from '../config';
import { blockchain } from '../services/blockchain';
import { database } from '../services/database';
import { roles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('claim')
  .setDescription('Claim your pending TOURS tokens or check airdrop eligibility');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  // Check if user has wallet linked
  const user = await database.getUser(interaction.user.id);
  if (!user?.wallet_address) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Wallet Not Linked')
          .setDescription('You need to link your wallet first. Use `/link-wallet` to get started.'),
      ],
    });
    return;
  }

  // Get pending tips
  const pendingTips = await database.getPendingTips(interaction.user.id);
  const totalPending = await database.getTotalPendingTips(interaction.user.id);

  // Check for airdrop eligibility
  let claimableAirdrop = 0n;
  let hasClaimedAirdrop = true;
  let airdropAvailable = false;

  if (config.blockchain.claimContractAddress !== '0x0000000000000000000000000000000000000000') {
    airdropAvailable = true;
    try {
      hasClaimedAirdrop = await blockchain.hasClaimed(user.wallet_address as Address);
      if (!hasClaimedAirdrop) {
        claimableAirdrop = await blockchain.getClaimableAmount(user.wallet_address as Address);
      }
    } catch {
      // Ignore errors, just don't show airdrop
    }
  }

  // Get claim history
  const claims = await database.getClaims(interaction.user.id);
  const totalClaimed = claims
    .filter(c => c.status === 'completed')
    .reduce((sum, c) => sum + BigInt(c.amount), 0n);

  // Build status embed
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Claim Status')
    .setThumbnail(interaction.user.displayAvatarURL());

  // Pending tips section
  if (totalPending > 0n) {
    embed.addFields({
      name: 'Pending Tips',
      value: `**${blockchain.formatBalance(totalPending)} TOURS** from ${pendingTips.length} tip(s)`,
      inline: true,
    });
  } else {
    embed.addFields({
      name: 'Pending Tips',
      value: 'None',
      inline: true,
    });
  }

  // Airdrop section
  if (airdropAvailable) {
    if (hasClaimedAirdrop) {
      embed.addFields({
        name: 'Airdrop',
        value: 'Already claimed',
        inline: true,
      });
    } else if (claimableAirdrop > 0n) {
      embed.addFields({
        name: 'Airdrop',
        value: `**${blockchain.formatBalance(claimableAirdrop)} TOURS** available`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: 'Airdrop',
        value: 'Not eligible',
        inline: true,
      });
    }
  } else {
    embed.addFields({
      name: 'Airdrop',
      value: 'No active airdrop',
      inline: true,
    });
  }

  // Total claimed
  embed.addFields({
    name: 'Total Claimed',
    value: `**${blockchain.formatBalance(totalClaimed)} TOURS** (${claims.length} claim${claims.length !== 1 ? 's' : ''})`,
    inline: false,
  });

  // Add claim buttons if there's something to claim
  const buttons: ButtonBuilder[] = [];

  if (totalPending > 0n) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('claim_tips')
        .setLabel(`Claim Tips (${blockchain.formatBalance(totalPending)} TOURS)`)
        .setStyle(ButtonStyle.Success)
    );
  }

  if (claimableAirdrop > 0n) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('claim_airdrop_info')
        .setLabel('Airdrop Info')
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (buttons.length > 0) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Handle button interactions
    try {
      const response = await interaction.fetchReply();
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id,
        time: 60000,
      });

      if (confirmation.customId === 'claim_tips') {
        await handleClaimTips(confirmation, user.wallet_address, totalPending, interaction);
      } else if (confirmation.customId === 'claim_airdrop_info') {
        await handleAirdropInfo(confirmation, user.wallet_address, claimableAirdrop);
      }
    } catch {
      // Timeout, remove components
      await interaction.editReply({ components: [] });
    }
  } else {
    // No claimable items, just show status
    if (claims.length > 0) {
      const recentClaims = claims.slice(0, 5);
      embed.addFields({
        name: 'Recent Claims',
        value: recentClaims.map(c => {
          const amount = blockchain.formatBalance(BigInt(c.amount));
          const date = new Date(c.created_at).toLocaleDateString();
          return `- ${amount} TOURS (${c.claim_type}) - ${date}`;
        }).join('\n'),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleClaimTips(
  confirmation: any,
  walletAddress: string,
  totalPending: bigint,
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Update to processing state
  await confirmation.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffff00)
        .setTitle('Processing Claim...')
        .setDescription('Please wait while your tips are being transferred to your wallet.'),
    ],
    components: [],
  });

  try {
    // Transfer from tip pool to user's wallet
    const txHash = await blockchain.transferFromPool(
      walletAddress as Address,
      totalPending
    );

    // Wait for confirmation
    const success = await blockchain.waitForTransaction(txHash);

    if (success) {
      // Record the claim
      await database.createClaim(
        interaction.user.id,
        totalPending.toString(),
        'tips',
        txHash
      );

      // Delete pending tips
      await database.deletePendingTips(interaction.user.id);

      // Update roles
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      if (member) {
        await roles.updateMemberRoles(member);
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Tips Claimed!')
            .setDescription(`Successfully claimed **${blockchain.formatBalance(totalPending)} TOURS**!`)
            .addFields(
              {
                name: 'Transaction',
                value: `[View on Explorer](${config.getExplorerUrl(txHash)})`,
              }
            )
            .setTimestamp(),
        ],
        components: [],
      });
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Transaction Failed')
            .setDescription('The claim transaction failed. Your pending tips are still available. Please try again.'),
        ],
        components: [],
      });
    }
  } catch (error) {
    console.error('Claim tips error:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('An error occurred while claiming tips. Please try again later.'),
      ],
      components: [],
    });
  }
}

async function handleAirdropInfo(
  confirmation: any,
  walletAddress: string,
  claimableAirdrop: bigint
): Promise<void> {
  const claimUrl = `${config.getChain().blockExplorers?.default.url}/address/${config.blockchain.claimContractAddress}#writeContract`;

  await confirmation.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Claim Your Airdrop')
        .setDescription('To claim your airdrop, you need to interact with the claim contract directly from your wallet.')
        .addFields(
          {
            name: 'Claimable Amount',
            value: `**${blockchain.formatBalance(claimableAirdrop)} TOURS**`,
          },
          {
            name: 'How to Claim',
            value: [
              `1. Go to the [claim contract](${claimUrl})`,
              '2. Connect your wallet',
              '3. Call the `claim()` function',
              '4. Confirm the transaction in your wallet',
            ].join('\n'),
          },
          {
            name: 'Your Wallet',
            value: `\`${walletAddress}\``,
          },
          {
            name: 'Claim Contract',
            value: `\`${config.blockchain.claimContractAddress}\``,
          }
        ),
    ],
    components: [],
  });
}
