import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { Address } from 'viem';
import config from '../config';
import { blockchain } from '../services/blockchain';
import { database } from '../services/database';
import { roles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('tip')
  .setDescription('Send TOURS tokens to another user')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to tip')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('amount')
      .setDescription('Amount of TOURS to send')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('Optional message with your tip')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const recipient = interaction.options.getUser('user', true);
  const amount = interaction.options.getNumber('amount', true);
  const message = interaction.options.getString('message');

  // Prevent self-tipping
  if (recipient.id === interaction.user.id) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('You cannot tip yourself!'),
      ],
    });
    return;
  }

  // Prevent tipping bots
  if (recipient.bot) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('You cannot tip bots!'),
      ],
    });
    return;
  }

  // Get sender's wallet
  const sender = await database.getUser(interaction.user.id);
  if (!sender?.wallet_address) {
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

  // Get recipient's wallet
  const recipientUser = await database.getUser(recipient.id);

  try {
    const amountWei = blockchain.parseAmount(amount.toString());

    // Check sender's balance
    const senderBalance = await blockchain.getBalance(sender.wallet_address as Address);
    if (senderBalance < amountWei) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Insufficient Balance')
            .setDescription(`You don't have enough TOURS. Your balance: ${blockchain.formatBalance(senderBalance)} TOURS`),
        ],
      });
      return;
    }

    // If recipient has a wallet, send on-chain
    if (recipientUser?.wallet_address) {
      // Transfer from tip pool
      const txHash = await blockchain.transferFromPool(
        recipientUser.wallet_address as Address,
        amountWei
      );

      // Record the tip
      await database.createTip(
        interaction.user.id,
        recipient.id,
        amountWei.toString(),
        txHash
      );

      // Wait for confirmation
      const success = await blockchain.waitForTransaction(txHash);

      if (success) {
        // Update roles for both users
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const recipientMember = await interaction.guild?.members.fetch(recipient.id);

        if (member) await roles.updateMemberRoles(member);
        if (recipientMember) await roles.updateMemberRoles(recipientMember);

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('Tip Sent!')
          .setDescription(`You sent **${amount} TOURS** to ${recipient}`)
          .addFields(
            { name: 'Transaction', value: `[View on Explorer](${config.getExplorerUrl(txHash)})` }
          )
          .setTimestamp();

        if (message) {
          embed.addFields({ name: 'Message', value: message });
        }

        await interaction.editReply({ embeds: [embed] });

        // Notify recipient
        try {
          await recipient.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('You Received a Tip!')
                .setDescription(`${interaction.user} sent you **${amount} TOURS**!`)
                .addFields(
                  { name: 'Transaction', value: `[View on Explorer](${config.getExplorerUrl(txHash)})` }
                )
                .setTimestamp(),
            ],
          });
        } catch {
          // User has DMs disabled
        }
      } else {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('Transaction Failed')
              .setDescription('The tip transaction failed. Please try again.'),
          ],
        });
      }
    } else {
      // Store as pending tip (off-chain)
      await database.createPendingTip(
        interaction.user.id,
        recipient.id,
        amountWei.toString()
      );

      const embed = new EmbedBuilder()
        .setColor(0xffff00)
        .setTitle('Tip Pending')
        .setDescription(`You sent **${amount} TOURS** to ${recipient}`)
        .addFields(
          {
            name: 'Note',
            value: `${recipient.username} hasn't linked their wallet yet. The tip will be claimable once they use \`/link-wallet\`.`,
          }
        )
        .setTimestamp();

      if (message) {
        embed.addFields({ name: 'Message', value: message });
      }

      await interaction.editReply({ embeds: [embed] });

      // Notify recipient about pending tip
      try {
        await recipient.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffff00)
              .setTitle('You Have a Pending Tip!')
              .setDescription(`${interaction.user} sent you **${amount} TOURS**!`)
              .addFields(
                {
                  name: 'How to Claim',
                  value: 'Link your wallet using `/link-wallet` to claim your tips.',
                }
              )
              .setTimestamp(),
          ],
        });
      } catch {
        // User has DMs disabled
      }
    }
  } catch (error) {
    console.error('Tip error:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('An error occurred while processing your tip. Please try again later.'),
      ],
    });
  }
}
