import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import config from '../config';
import { database } from '../services/database';

// Farcaster API response types
interface FarcasterUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  profile: {
    bio: {
      text: string;
    };
  };
  follower_count: number;
  following_count: number;
  verifications: string[];
}

interface NeynarUserResponse {
  users: FarcasterUser[];
}

interface NeynarSearchResponse {
  result: {
    users: FarcasterUser[];
  };
}

export const data = new SlashCommandBuilder()
  .setName('verify-farcaster')
  .setDescription('Link your Farcaster account to your Discord')
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('Your Farcaster username (without @)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const username = interaction.options.getString('username');

  // Check if user already has Farcaster linked
  const existingUser = await database.getUser(interaction.user.id);
  if (existingUser?.farcaster_fid) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle('Farcaster Already Linked')
          .setDescription(`You already have a Farcaster account linked: @${existingUser.farcaster_username}`)
          .addFields({
            name: 'Want to change?',
            value: 'Click the Unlink button below to unlink your current account.',
          }),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('unlink_farcaster')
            .setLabel('Unlink Farcaster')
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

      if (confirmation.customId === 'unlink_farcaster') {
        await database.linkFarcaster(interaction.user.id, 0, '');
        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('Farcaster Unlinked')
              .setDescription('Your Farcaster account has been unlinked. Use `/verify-farcaster` again to link a new one.'),
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

  if (!username) {
    // Show instructions
    const embed = new EmbedBuilder()
      .setColor(0x8a63d2) // Farcaster purple
      .setTitle('Verify Your Farcaster Account')
      .setDescription('Link your Farcaster account to your Discord to unlock additional features.')
      .addFields(
        {
          name: 'Usage',
          value: '`/verify-farcaster username:yourname`',
        },
        {
          name: 'Benefits',
          value: [
            '- Cross-platform identity verification',
            '- Display your Farcaster profile in balance checks',
            '- Participate in Farcaster-exclusive events',
          ].join('\n'),
        },
        {
          name: 'Requirements',
          value: 'You must have an active Farcaster account.',
        }
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  try {
    // Fetch Farcaster user data via Neynar
    const farcasterUser = await fetchFarcasterUser(username);

    if (!farcasterUser) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('User Not Found')
            .setDescription(`Could not find Farcaster user @${username}. Please check the username and try again.`),
        ],
      });
      return;
    }

    // Check if this Farcaster account is already linked to another Discord user
    const existingFarcaster = await database.getUserByFarcaster(farcasterUser.fid);
    if (existingFarcaster && existingFarcaster.discord_id !== interaction.user.id) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Account Already Linked')
            .setDescription('This Farcaster account is already linked to another Discord user.'),
        ],
      });
      return;
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    await database.createVerificationCode(interaction.user.id, verificationCode, 15);

    // Create verification embed
    const embed = new EmbedBuilder()
      .setColor(0x8a63d2)
      .setTitle('Verify Farcaster Ownership')
      .setDescription('Please verify that you own this Farcaster account.')
      .setThumbnail(farcasterUser.pfp_url || '')
      .addFields(
        {
          name: 'Farcaster Account',
          value: `@${farcasterUser.username} (FID: ${farcasterUser.fid})`,
        },
        {
          name: 'Display Name',
          value: farcasterUser.display_name || farcasterUser.username,
        },
        {
          name: 'Followers',
          value: farcasterUser.follower_count?.toString() || '0',
          inline: true,
        },
        {
          name: 'Following',
          value: farcasterUser.following_count?.toString() || '0',
          inline: true,
        },
        {
          name: 'Verification',
          value: 'Click the button below to confirm ownership of this account.',
        }
      )
      .setFooter({ text: 'Verification expires in 15 minutes' });

    // Create buttons
    const verifyButton = new ButtonBuilder()
      .setCustomId(`verify_farcaster_${farcasterUser.fid}`)
      .setLabel('I Own This Account')
      .setStyle(ButtonStyle.Primary);

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_farcaster')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton, cancelButton);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Wait for button interaction
    try {
      const response = await interaction.fetchReply();
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id,
        time: 900000, // 15 minutes
      });

      if (confirmation.customId === 'cancel_farcaster') {
        await database.deleteVerificationCode(interaction.user.id);
        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('Verification Cancelled')
              .setDescription('Farcaster verification has been cancelled.'),
          ],
          components: [],
        });
        return;
      }

      // Verify code is still valid
      const storedCode = await database.getVerificationCode(interaction.user.id);
      if (!storedCode) {
        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('Verification Expired')
              .setDescription('Your verification has expired. Please try again.'),
          ],
          components: [],
        });
        return;
      }

      // Link Farcaster account
      const success = await database.linkFarcaster(
        interaction.user.id,
        farcasterUser.fid,
        farcasterUser.username
      );

      if (success) {
        await database.deleteVerificationCode(interaction.user.id);

        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('Farcaster Verified!')
              .setDescription(`Successfully linked @${farcasterUser.username} to your Discord account.`)
              .setThumbnail(farcasterUser.pfp_url || '')
              .addFields(
                {
                  name: 'FID',
                  value: farcasterUser.fid.toString(),
                  inline: true,
                },
                {
                  name: 'Username',
                  value: `@${farcasterUser.username}`,
                  inline: true,
                }
              ),
          ],
          components: [],
        });
      } else {
        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('Error')
              .setDescription('Failed to link Farcaster account. Please try again.'),
          ],
          components: [],
        });
      }
    } catch {
      await database.deleteVerificationCode(interaction.user.id);
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
  } catch (error) {
    console.error('Farcaster verification error:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Error')
          .setDescription('An error occurred while verifying your Farcaster account. Please try again later.'),
      ],
    });
  }
}

// Helper function to fetch Farcaster user by username via Neynar
async function fetchFarcasterUser(username: string): Promise<FarcasterUser | null> {
  try {
    // Use Neynar API to search for user
    const apiKey = config.farcaster.neynarApiKey;
    if (!apiKey) {
      console.warn('NEYNAR_API_KEY not configured');
      return null;
    }

    const searchResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(username)}&limit=5`,
      {
        headers: {
          'accept': 'application/json',
          'api_key': apiKey,
        },
      }
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json() as NeynarSearchResponse;
      const users = data.result?.users || [];
      // Find exact username match (case insensitive)
      return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
    }

    console.error('Neynar search failed:', searchResponse.status);
    return null;
  } catch (error) {
    console.error('Error fetching Farcaster user:', error);
    return null;
  }
}

function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'FC-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
