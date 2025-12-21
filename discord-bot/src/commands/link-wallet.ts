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
import { blockchain } from '../services/blockchain';
import { database } from '../services/database';
import { roles } from '../services/roles';

export const data = new SlashCommandBuilder()
  .setName('link-wallet')
  .setDescription('Link your Monad wallet to your Discord account')
  .addStringOption(option =>
    option
      .setName('address')
      .setDescription('Your wallet address (0x...)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const address = interaction.options.getString('address');

  // Check if user already has a wallet linked
  const existingUser = await database.getUser(interaction.user.id);
  if (existingUser?.wallet_address) {
    // Show current wallet with unlink option
    const balance = await blockchain.getBalance(existingUser.wallet_address as Address).catch(() => 0n);
    const tier = roles.getTierForBalance(balance);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle('Wallet Already Linked')
          .setDescription(`You already have a wallet linked.`)
          .addFields(
            {
              name: 'Current Wallet',
              value: `\`${existingUser.wallet_address}\``,
            },
            {
              name: 'Balance',
              value: `${blockchain.formatBalance(balance)} TOURS`,
              inline: true,
            },
            {
              name: 'Tier',
              value: roles.formatTierDisplay(tier),
              inline: true,
            }
          )
          .addFields({
            name: 'Want to change?',
            value: 'Click the Unlink button below to unlink your current wallet.',
          }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('unlink_wallet')
            .setLabel('Unlink Wallet')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });

    // Handle unlink button
    try {
      const response = await interaction.fetchReply();
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id,
        time: 60000,
      });

      if (confirmation.customId === 'unlink_wallet') {
        // Remove tier roles
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (member) {
          await roles.removeAllTierRoles(member);
        }

        await database.unlinkWallet(interaction.user.id);

        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('Wallet Unlinked')
              .setDescription('Your wallet has been unlinked. Use `/link-wallet` again to link a new one.'),
          ],
          components: [],
        });
      }
    } catch {
      // Timeout, just remove components
      await interaction.editReply({ components: [] });
    }
    return;
  }

  if (!address) {
    // Show instructions for linking
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Link Your Wallet')
      .setDescription('To link your wallet, provide your Monad-compatible wallet address.')
      .addFields(
        {
          name: 'Usage',
          value: '`/link-wallet address:0xYourWalletAddress`',
        },
        {
          name: 'Supported Wallets',
          value: 'Any EVM-compatible wallet (MetaMask, Rabby, Coinbase Wallet, etc.)',
        },
        {
          name: 'Why Link?',
          value: [
            '- Check your TOURS balance',
            '- Receive tips from other users',
            '- Get role tiers based on holdings (1k/10k/100k)',
            '- Participate in token claims',
          ].join('\n'),
        }
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Validate address format
  if (!blockchain.isValidAddress(address)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Invalid Address')
          .setDescription('Please provide a valid wallet address (0x followed by 40 hex characters).'),
      ],
    });
    return;
  }

  // Check if address is already linked to another user
  const existingWallet = await database.getUserByWallet(address);
  if (existingWallet && existingWallet.discord_id !== interaction.user.id) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Address Already Linked')
          .setDescription('This wallet address is already linked to another Discord account.'),
      ],
    });
    return;
  }

  // Generate verification code
  const verificationCode = generateVerificationCode();
  await database.createVerificationCode(interaction.user.id, verificationCode, 10);

  // Create verification button
  const verifyButton = new ButtonBuilder()
    .setCustomId(`verify_wallet_${address.toLowerCase()}`)
    .setLabel('I Own This Wallet')
    .setStyle(ButtonStyle.Primary);

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_wallet')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton, cancelButton);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Verify Wallet Ownership')
    .setDescription('Please confirm that you own this wallet address.')
    .addFields(
      {
        name: 'Address',
        value: `\`${address}\``,
      },
      {
        name: 'Instructions',
        value: 'Click the button below to confirm ownership and link this wallet to your Discord account.',
      }
    )
    .setFooter({ text: 'This verification expires in 10 minutes' });

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Wait for button click
  try {
    const response = await interaction.fetchReply();
    const confirmation = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 600000, // 10 minutes
    });

    if (confirmation.customId === 'cancel_wallet') {
      await database.deleteVerificationCode(interaction.user.id);
      await confirmation.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Cancelled')
            .setDescription('Wallet linking cancelled.'),
        ],
        components: [],
      });
      return;
    }

    // Verify the code is still valid
    const storedCode = await database.getVerificationCode(interaction.user.id);
    if (!storedCode || storedCode.code !== verificationCode) {
      await confirmation.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Verification Expired')
            .setDescription('Your verification code has expired. Please try again.'),
        ],
        components: [],
      });
      return;
    }

    // Link the wallet
    const success = await database.linkWallet(interaction.user.id, address);

    if (success) {
      // Delete verification code
      await database.deleteVerificationCode(interaction.user.id);

      // Update roles
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      let roleUpdate = null;
      if (member) {
        roleUpdate = await roles.updateMemberRoles(member);
      }

      // Check for pending tips
      const pendingTips = await database.getPendingTips(interaction.user.id);
      const totalPending = await database.getTotalPendingTips(interaction.user.id);

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Wallet Linked Successfully!')
        .setDescription(`Your wallet has been linked to your Discord account.`)
        .addFields({
          name: 'Address',
          value: `\`${address}\``,
        });

      if (roleUpdate?.currentTier) {
        successEmbed.addFields({
          name: 'Tier Assigned',
          value: roles.formatTierDisplay(roleUpdate.currentTier),
        });
      }

      if (pendingTips.length > 0) {
        successEmbed.addFields({
          name: 'Pending Tips',
          value: `You have **${blockchain.formatBalance(totalPending)} TOURS** in pending tips from ${pendingTips.length} tip(s)! Use \`/claim\` to claim them.`,
        });
      }

      await confirmation.update({
        embeds: [successEmbed],
        components: [],
      });
    } else {
      await confirmation.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Error')
            .setDescription('Failed to link wallet. This wallet may already be linked to another account.'),
        ],
        components: [],
      });
    }
  } catch {
    // Timeout or error
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Verification Timed Out')
          .setDescription('The verification timed out. Please try again.'),
      ],
      components: [],
    });
  }
}

function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
