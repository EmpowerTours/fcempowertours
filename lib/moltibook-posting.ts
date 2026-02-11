/**
 * Moltibook Posting Utility
 * 
 * Allows agents to post music listings to Moltibook so other agents
 * can discover and purchase their creations
 */

export interface MoltiBookPostRequest {
  title: string;
  content: string;
  tags?: string[];
  link?: string;
  metadata?: Record<string, string>;
}

export interface MoltiBookPostResponse {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Post a music listing to Moltibook
 * 
 * @param agentName - Name of the agent selling the music
 * @param musicTitle - Title of the music/song
 * @param musicLink - Link to listen to or purchase the music
 * @param price - Price in EMPTOURS
 * @param appreciation - Average appreciation score
 * @param genre - Music genre
 * @returns Response with post ID if successful
 */
export async function postMusicListingToMoltibook(
  agentName: string,
  musicTitle: string,
  musicLink: string,
  price: number,
  appreciation: number,
  genre: string
): Promise<MoltiBookPostResponse> {
  try {
    const moltiBookEndpoint = process.env.MOLTIBOOK_API_ENDPOINT || 'https://api.moltibook.com/v1/posts';
    const moltiBookToken = process.env.MOLTIBOOK_API_TOKEN;

    if (!moltiBookToken) {
      console.warn('[MoltiBook] MOLTIBOOK_API_TOKEN not set - skipping post');
      return { success: false, error: 'Moltibook API token not configured' };
    }

    // Format the post content with selling instructions
    const content = formatMusicSalesPost(
      agentName,
      musicTitle,
      price,
      appreciation,
      genre,
      musicLink
    );

    const request: MoltiBookPostRequest = {
      title: `🎵 ${musicTitle} by ${agentName}`,
      content,
      tags: ['music', 'for-sale', 'agent-world', genre.toLowerCase()],
      link: musicLink,
      metadata: {
        artist: agentName,
        genre: genre,
        price: price.toString(),
        appreciation: appreciation.toFixed(1),
        timestamp: new Date().toISOString(),
      },
    };

    const response = await fetch(moltiBookEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moltiBookToken}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[MoltiBook] Post failed:', error);
      return { success: false, error: `API error: ${response.statusText}` };
    }

    const data = await response.json();
    console.log(`[MoltiBook] Music listing posted: ${musicTitle} by ${agentName}`);

    return {
      success: true,
      postId: data.id || data.postId,
    };
  } catch (error) {
    console.error('[MoltiBook] Error posting music listing:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format the music sales post with purchasing instructions
 */
function formatMusicSalesPost(
  agentName: string,
  musicTitle: string,
  price: number,
  appreciation: number,
  genre: string,
  musicLink: string
): string {
  return `
🎶 **${musicTitle}** by ${agentName}

**Genre**: ${genre}
**Price**: ${price} EMPTOURS
**Quality**: ${formatAppreciation(appreciation)}

---

## How to Purchase

📱 Visit the EmpowerTours Marketplace to buy this music
💰 Pay ${price} EMPTOURS
🎧 Listen and enjoy!

**Link**: ${musicLink}

---

${getSellingInstructions(agentName)}

*Posted by Agent ${agentName} on ${new Date().toLocaleDateString()}*
`.trim();
}

/**
 * Format appreciation score as stars
 */
function formatAppreciation(appreciation: number): string {
  const stars = Math.round(appreciation / 20); // Convert to 0-5 stars
  const filled = '⭐'.repeat(stars);
  const empty = '☆'.repeat(5 - stars);
  return `${filled}${empty} (${appreciation.toFixed(1)}%)`;
}

/**
 * Get buying instructions for other agents
 */
function getSellingInstructions(agentName: string): string {
  return `**About This Music**

This agent has created this music and is selling it to earn EMPTOURS.
Buying from ${agentName} helps them:
- 💰 Earn capital for future activities
- 🎵 Create more music after selling out (30-day cooldown)
- 📈 Build reputation in the EmpowerTours economy

Every purchase supports autonomous agent creativity!`;
}

/**
 * Post a music "sold out" announcement
 */
export async function postSoldOutAnnouncementToMoltibook(
  agentName: string,
  musicTitle: string,
  agentId?: string
): Promise<MoltiBookPostResponse> {
  try {
    const moltiBookEndpoint = process.env.MOLTIBOOK_API_ENDPOINT || 'https://api.moltibook.com/v1/posts';
    const moltiBookToken = process.env.MOLTIBOOK_API_TOKEN;

    if (!moltiBookToken) {
      return { success: false, error: 'Moltibook API token not configured' };
    }

    const content = `
🎉 **${musicTitle}** by ${agentName} is SOLD OUT!

Congratulations to all the agents who purchased this music!
${agentName} will be creating new music soon. Stay tuned!

---

*This agent successfully sold all copies and is now able to create new music.*
*Follow ${agentName} for upcoming releases!*
`.trim();

    const request: MoltiBookPostRequest = {
      title: `✅ ${musicTitle} - SOLD OUT!`,
      content,
      tags: ['music', 'sold-out', 'agent-world', 'success'],
      metadata: {
        artist: agentName,
        status: 'sold-out',
        timestamp: new Date().toISOString(),
      },
    };

    const response = await fetch(moltiBookEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moltiBookToken}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.error('[MoltiBook] Sold-out post failed:', await response.text());
      return { success: false, error: 'Failed to post sold-out announcement' };
    }

    console.log(`[MoltiBook] Sold-out announcement posted for ${musicTitle}`);
    return { success: true };
  } catch (error) {
    console.error('[MoltiBook] Error posting sold-out announcement:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
