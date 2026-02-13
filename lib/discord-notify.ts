/**
 * Discord Webhook Notifications for Agent World
 * Sends notifications to Discord when agents interact with the world
 *
 * Set DISCORD_WEBHOOK_AGENT_WORLD in Railway env vars (not in .env file)
 */

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_AGENT_WORLD;

interface AgentActionNotification {
  agentName: string;
  agentAddress: string;
  action: string;
  toursEarned?: string;
  txHash?: string;
}

interface AgentEntryNotification {
  agentName: string;
  agentAddress: string;
  description?: string;
  txHash?: string;
}

/**
 * Send a notification to Discord via webhook
 */
async function sendDiscordNotification(content: string, embeds?: any[]): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('[Discord] No webhook URL configured - skipping notification');
    return false;
  }

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        embeds,
        username: 'EmpowerTours World',
        avatar_url: 'https://fcempowertours-production-6551.up.railway.app/empowertours-logo.png',
      }),
    });

    if (!res.ok) {
      console.error('[Discord] Webhook failed:', res.status, await res.text());
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[Discord] Notification error:', err.message);
    return false;
  }
}

/**
 * Notify Discord when an agent performs an action
 */
export async function notifyAgentAction(data: AgentActionNotification): Promise<void> {
  const { agentName, agentAddress, action, toursEarned, txHash } = data;

  const shortAddr = `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`;
  const txLink = txHash ? `\n[View TX](https://monadscan.com/tx/${txHash})` : '';
  const reward = toursEarned && toursEarned !== '0' ? ` (+${toursEarned} TOURS)` : '';

  const content = `**${agentName}** (${shortAddr}) executed **${action}**${reward}${txLink}`;

  await sendDiscordNotification(content);
}

/**
 * Notify Discord when a new agent enters the world
 */
export async function notifyAgentEntry(data: AgentEntryNotification): Promise<void> {
  const { agentName, agentAddress, description, txHash } = data;

  const shortAddr = `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`;
  const txLink = txHash ? `\n[View TX](https://monadscan.com/tx/${txHash})` : '';
  const desc = description ? `\n> ${description}` : '';

  const content = `**New Agent Entered the World!**\n\n**${agentName}** (${shortAddr})${desc}${txLink}`;

  await sendDiscordNotification(content);
}

/**
 * Notify Discord of lottery events
 * Automatically strips Farcaster FID mentions like <@1> and replaces with addresses
 */
export async function notifyLotteryEvent(message: string): Promise<void> {
  // Strip any Farcaster FID mentions that don't work in Discord
  // Pattern: <@1>, <@!1>, etc. - single digit FIDs that are invalid Discord user IDs
  const cleanedMessage = message.replace(/<@!?(\d{1,3})>/g, (match, fid) => {
    // If FID is very small (1-999), it's likely a Farcaster ID, not Discord
    return `User(FID:${fid})`;
  });
  
  await sendDiscordNotification(cleanedMessage);
}

/**
 * Generic notification for custom messages
 */
export async function notifyDiscord(message: string): Promise<void> {
  await sendDiscordNotification(message);
}
