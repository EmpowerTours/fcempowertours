import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseEther, encodeFunctionData } from 'viem';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const USE_AI = process.env.USE_GEMINI === 'true';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const MUSIC_NFT_ADDRESS = '0xaD849874B0111131A30D7D2185Cc1519A83dd3D0' as `0x${string}`;

// MusicNFT ABI for purchasing
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'buyer', type: 'address' }
    ],
    name: 'purchaseLicense',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

// Command patterns (fallback)
const COMMANDS = {
  swap: /swap|exchange|convert.*(\d+\.?\d*)\s*(mon|eth)/i,
  mintMusic: /mint music|create music|upload music/i,
  mintPassport: /mint passport|get passport|create passport/i,
  buyMusic: /buy|purchase|get.*music|song|track/i,
  navigate: {
    passport: /passport|travel/i,
    music: /music|song/i,
    market: /market|marketplace|buy|sell/i,
    profile: /profile|my nfts|wallet/i,
    home: /home|main/i,
  },
  help: /help|commands|what can you do/i,
};

// Search for music NFT by name
async function findMusicNFT(songName: string): Promise<{ tokenId: number; price: string; artist: string; name: string } | null> {
  try {
    const query = `
      query SearchMusic {
        MusicNFT(order_by: {mintedAt: desc}, limit: 50) {
          tokenId
          tokenURI
          artist
          owner
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();
    const allMusic = result.data?.MusicNFT || [];

    // Fetch metadata for each and search by name
    for (const nft of allMusic) {
      try {
        const metadataUrl = nft.tokenURI.replace('ipfs://', 'https://harlequin-used-hare-224.mypinata.cloud/ipfs/');
        const metadataRes = await fetch(metadataUrl);
        const metadata = await metadataRes.json();
        
        const nftName = metadata.name || '';
        
        // Fuzzy match song name
        if (nftName.toLowerCase().includes(songName.toLowerCase())) {
          return {
            tokenId: nft.tokenId,
            price: '0.01', // TODO: Fetch actual price from contract
            artist: nft.artist,
            name: nftName,
          };
        }
      } catch (err) {
        console.error('Failed to fetch metadata for NFT:', nft.tokenId);
      }
    }

    return null;
  } catch (error) {
    console.error('Error searching music:', error);
    return null;
  }
}

// AI-powered command parsing
async function parseCommandWithAI(command: string): Promise<any> {
  if (!USE_AI) {
    return parseCommandWithRegex(command);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `Parse this user command and return ONLY valid JSON (no markdown, no explanation):
Command: "${command}"

Return format:
{
  "intent": "swap" | "mint_music" | "mint_passport" | "buy_music" | "navigate" | "help" | "unknown",
  "params": {
    "amount"?: "0.1",
    "songName"?: "song title",
    "destination"?: "music" | "passport" | "market" | "profile" | "home"
  }
}

Examples:
- "swap 0.5 mon" → {"intent":"swap","params":{"amount":"0.5"}}
- "buy money making machine" → {"intent":"buy_music","params":{"songName":"money making machine"}}
- "purchase epic track song" → {"intent":"buy_music","params":{"songName":"epic track"}}
- "go to passport" → {"intent":"navigate","params":{"destination":"passport"}}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    console.log('✅ AI parsed:', parsed);
    return parsed;
  } catch (error) {
    console.error('❌ AI parsing failed:', error);
    return parseCommandWithRegex(command);
  }
}

// Fallback regex parsing
function parseCommandWithRegex(command: string): any {
  const cmd = command.toLowerCase().trim();

  if (COMMANDS.help.test(cmd)) {
    return { intent: 'help', params: {} };
  }

  // Swap
  const swapMatch = cmd.match(COMMANDS.swap);
  if (swapMatch) {
    const amount = swapMatch[1] || '0.1';
    return { intent: 'swap', params: { amount } };
  }

  // Buy music - extract song name
  if (COMMANDS.buyMusic.test(cmd)) {
    // Extract song name after "buy" or "purchase"
    const songMatch = cmd.match(/(?:buy|purchase|get)\s+(?:music\s+)?(?:song\s+)?(?:track\s+)?(.+)/i);
    const songName = songMatch ? songMatch[1].trim() : '';
    return { intent: 'buy_music', params: { songName } };
  }

  // Mint commands
  if (COMMANDS.mintMusic.test(cmd)) {
    return { intent: 'mint_music', params: {} };
  }
  if (COMMANDS.mintPassport.test(cmd)) {
    return { intent: 'mint_passport', params: {} };
  }

  // Navigation
  for (const [key, regex] of Object.entries(COMMANDS.navigate)) {
    if (regex.test(cmd)) {
      return { intent: 'navigate', params: { destination: key } };
    }
  }

  return { intent: 'unknown', params: {} };
}

export async function POST(req: NextRequest) {
  try {
    const { command, userAddress } = await req.json();
    
    if (!command?.trim()) {
      return NextResponse.json({
        success: false,
        message: 'Please enter a command',
      });
    }

    console.log('🤖 Processing command:', command);

    // Parse with AI or regex
    const parsed = await parseCommandWithAI(command);
    console.log('📋 Parsed intent:', parsed.intent);

    // Handle help
    if (parsed.intent === 'help') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🤖 AI Bot Commands:

💱 Transactions:
- "swap 0.5 MON" → Swap MON for TOURS tokens
- "mint music" → Create a new music NFT
- "mint passport" → Get a travel passport NFT
- "buy [song name]" → Purchase a music NFT

📍 Navigation:
- "passport" → Go to passport page
- "music" → Go to music page  
- "market" → Browse marketplace
- "profile" → View your NFTs
- "home" → Go home

💡 Examples:
- "buy money making machine"
- "purchase epic track song"
- "I want to get summer vibes"`,
      });
    }

    // Handle buy music
    if (parsed.intent === 'buy_music') {
      const songName = parsed.params?.songName;
      
      if (!songName) {
        return NextResponse.json({
          success: false,
          message: '❌ Please specify a song name.\n\nExample: "buy money making machine"',
        });
      }

      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Please connect your wallet first to buy music',
        });
      }

      console.log(`🎵 Searching for song: "${songName}"`);
      const nft = await findMusicNFT(songName);

      if (!nft) {
        return NextResponse.json({
          success: false,
          message: `❌ Song "${songName}" not found.\n\nTry browsing the marketplace or check the exact song name.`,
        });
      }

      // Check if user is trying to buy their own music
      if (nft.artist.toLowerCase() === userAddress.toLowerCase()) {
        return NextResponse.json({
          success: false,
          message: `❌ You can't buy your own music!\n\n"${nft.name}" is already yours.`,
        });
      }

      // Return transaction info for user to confirm
      return NextResponse.json({
        success: true,
        action: 'confirm_purchase',
        message: `🎵 Found: "${nft.name}"\n\n💰 Price: ${nft.price} ETH\n🎨 Artist: ${nft.artist.slice(0, 10)}...\n\n⚠️ To complete purchase, visit:\n/artist/${nft.artist}\n\nOr click the purchase button there.`,
        data: {
          tokenId: nft.tokenId,
          price: nft.price,
          name: nft.name,
          artist: nft.artist,
        },
      });
    }

    // Handle swap (existing code)
    if (parsed.intent === 'swap') {
      // ... existing swap code
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/market',
        message: '💱 Visit the marketplace to swap tokens',
      });
    }

    // Handle mint music
    if (parsed.intent === 'mint_music') {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/music',
        message: '🎵 Taking you to mint music...',
      });
    }

    // Handle mint passport
    if (parsed.intent === 'mint_passport') {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/passport',
        message: '🎫 Taking you to get your passport...',
      });
    }

    // Handle navigation
    if (parsed.intent === 'navigate') {
      const destination = parsed.params?.destination || 'home';
      const paths: Record<string, string> = {
        passport: '/passport',
        music: '/music',
        market: '/market',
        profile: '/profile',
        home: '/',
      };

      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: paths[destination] || '/',
        message: `📍 Going to ${destination}...`,
      });
    }

    // Unknown command
    return NextResponse.json({
      success: false,
      message: `❓ I didn't understand "${command}"\n\nTry: "buy [song name]", "swap 0.1 MON", "mint music", or "help"`,
    });

  } catch (error: any) {
    console.error('❌ Bot error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
    }, { status: 500 });
  }
}
