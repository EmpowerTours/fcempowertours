import { NextRequest, NextResponse } from "next/server";
import { authorizeUserAddress, forwardAuthHeader } from "@/lib/quick-auth";
import {
  forwardOwnershipAttestation,
  issueOwnershipAttestation,
} from "@/lib/ownership-attestation";
import { delegationProvesOwnership } from "@/lib/delegation-proof";
import { checkRateLimit, getClientIP, RateLimiters } from "@/lib/rate-limit";
import {
  getResolvedCatalogue,
  getResolvedTrack,
} from "@/lib/catalogue-resolved";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";
import { findAllPassports } from "@/lib/passport-lookup";

const APP_URL =
  process.env.NEXT_PUBLIC_URL ||
  "https://fcempowertours-production-6551.up.railway.app";

// ✅ Helper to extract FID from Farcaster context
function extractFidFromRequest(req: NextRequest): string | null {
  // Try to get FID from request headers or body context
  const farcasterContext = req.headers.get("x-farcaster-context");
  if (farcasterContext) {
    try {
      const context = JSON.parse(farcasterContext);
      return context.user?.fid?.toString() || null;
    } catch {
      // Ignore parsing errors
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Extract all params from request body including collector edition fields
    const body = await req.json();
    const {
      command,
      userAddress,
      _location,
      fid: bodyFid,
      imageUrl: imageUrlFromRequest,
      title: _titleFromRequest,
      tokenURI: _tokenURIFromRequest,
      is_art,
      rightsDeclaration: rightsDeclarationFromRequest,
      // v3 minting: the artist signs the mint payload and this route only relays it. Both are
      // absent on the legacy path, where the platform mints directly.
      mintRequest: mintRequestFromRequest,
      mintSignature: mintSignatureFromRequest,
    } = body;

    // ✅ Get FID from body or request context
    const fid = bodyFid || extractFidFromRequest(req);

    // SECURITY: rate limit. This route fans out to paid APIs (Neynar,
    // Gemini) and internally to create/execute-delegated, so it was an
    // unthrottled cost-amplification vector.
    const botRl = await checkRateLimit(
      RateLimiters.general,
      getClientIP(req),
      userAddress || String(fid || ""),
    );
    if (!botRl.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Rate limit exceeded. Try again in ${botRl.resetIn}s.`,
        },
        { status: 429 },
      );
    }

    // 🔐 Prove the caller controls userAddress before acting on their behalf.
    // Allowed through with a warning until ENFORCE_QUICK_AUTH=true.
    //
    // A browser user proves ownership with a wallet signature rather than a Quick
    // Auth token. That signature cannot be forwarded downstream — it is bound to
    // this route's context and its nonce is single-use, while a single command can
    // fan out to three calls (mint → wrap → retry). So when the signature checks
    // out, mint a short-lived attestation for the internal hop instead. Without it
    // execute-delegated refused every fund-moving action from a browser with
    // "This action requires proof you own this address."
    let attestationHeader: Record<string, string> = {};
    if (userAddress) {
      const authz = await authorizeUserAddress(req, userAddress, "bot-command");
      if (!authz.allowed) {
        return NextResponse.json(
          { success: false, error: authz.reason || "Unauthorized" },
          { status: 401 },
        );
      }
      // A proven delegation stands in for the signature, exactly as it does in
      // execute-delegated and register-user-safe. Without this the ownership
      // prompt fired on EVERY mint: bot-command was the one route still
      // demanding a fresh signature, so a music mint cost two wallet prompts —
      // one to prove the address, one to approve the mint — where the passport
      // costs one per day.
      //
      // No action name is passed. The delegation is being used as proof of
      // IDENTITY here, not as a spending limit: the commands this route fans out
      // to are in publicActions, where the permission list is bypassed anyway.
      // A delegation only exists after ownership was proven once, so this
      // asserts exactly what the signature asserted, and nothing more.
      const provenByDelegation =
        !authz.ownsAddress && (await delegationProvesOwnership(userAddress));

      if (
        (authz.ownsAddress && authz.mode === "wallet") ||
        provenByDelegation
      ) {
        if (provenByDelegation) {
          console.log(
            `[Delegation] bot-command: ✅ ${userAddress.toLowerCase()} proved ownership by an existing delegation`,
          );
        }
        attestationHeader = await issueOwnershipAttestation(userAddress);
      }
    }

    // Internal service calls carry the caller's token so downstream routes can
    // verify identity themselves. Never used for third-party requests.
    const internalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...forwardAuthHeader(req),
      // Pass an inbound attestation through as well, so a chain more than one hop
      // deep does not silently lose the caller's identity.
      ...forwardOwnershipAttestation(req),
      ...attestationHeader,
    };

    console.log("Bot command received:", {
      command,
      userAddress,
      fid,
      imageUrl: imageUrlFromRequest,
    });

    // ✅ CRITICAL: Preserve original command for IPFS CIDs (case-sensitive)
    const originalCommand = command.trim();
    const lowerCommand = command.toLowerCase().trim().replace(/_/g, " ");

    // ==================== HELP COMMAND ====================
    if (lowerCommand === "help") {
      return NextResponse.json({
        success: true,
        action: "info",
        message: `EmpowerTours Radio 🎧

🎵 **Radio:**
- "radio" / "now playing" - What's on EmpowerTours Radio
- "catalog" - Browse the artists' latest tracks
- Listen anywhere: https://api.empowertours.xyz

🎫 **Music NFTs (Gasless):**
- "tip artist <address> <amount>" - Support an artist
- "buy music <tokenId>" - Buy a music NFT
- "mint passport" - Mint your passport NFT
- "check balance" - Check your MON/TOURS

💰 **Wallet:**
- "link wallet" - Link your wallet (required first)
- "deposit" - Get your deposit address
- "my balance" - Check your balance

ℹ️ "about" for more info | Transactions are FREE!`,
      });
    }

    // ==================== RADIO / NOW PLAYING ====================
    if (
      lowerCommand === "radio" ||
      lowerCommand === "now playing" ||
      lowerCommand === "what's playing" ||
      lowerCommand === "whats playing" ||
      lowerCommand === "catalog" ||
      lowerCommand === "new music"
    ) {
      const LISTEN_URL = "https://api.empowertours.xyz";
      try {
        const res = await fetch(`${LISTEN_URL}/api/v1/music`, {
          headers: { accept: "application/json" },
        });
        const json = await res.json();
        const songs: Array<{
          tokenId: string;
          name: string;
          artist: string;
          artistFid?: string;
          artistName?: string;
        }> = json?.data?.songs || [];

        if (!songs.length) {
          return NextResponse.json({
            success: true,
            action: "info",
            message: `🎧 **EmpowerTours Radio**\n\nNo tracks are on air yet — the artists are warming up.\n\nListen: ${LISTEN_URL}`,
          });
        }

        const shortAddr = (a: string) =>
          a && a.length > 12
            ? `${a.slice(0, 6)}…${a.slice(-4)}`
            : a || "Unknown artist";
        const artistOf = (s: { artistName?: string; artist: string }) =>
          s.artistName || shortAddr(s.artist);
        const top = songs.slice(0, 8);
        const list = top
          .map(
            (s) =>
              `• **${s.name || "Untitled"}** — ${artistOf(s)}  (#${s.tokenId})`,
          )
          .join("\n");
        const newest = songs[0];

        return NextResponse.json({
          success: true,
          action: "info",
          message:
            `🎧 **EmpowerTours Radio** — ${songs.length} track${songs.length === 1 ? "" : "s"} on air\n\n` +
            `🆕 Latest drop: **${newest.name || "Untitled"}** by ${artistOf(newest)}\n\n` +
            `${list}\n\n` +
            `▶️ Listen: ${LISTEN_URL}`,
        });
      } catch {
        return NextResponse.json({
          success: true,
          action: "info",
          message: `🎧 **EmpowerTours Radio**\n\nCouldn't reach the studio just now. Try again in a moment, or listen at https://api.empowertours.xyz`,
        });
      }
    }

    // ==================== STATUS COMMAND ====================
    if (lowerCommand === "status" || lowerCommand === "check status") {
      return NextResponse.json({
        success: true,
        action: "info",
        message: userAddress
          ? `Wallet Connected
Address: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
You can execute gasless transactions via our bot!
Try: "mint passport" or "check balance"`
          : `Wallet Not Connected
Please connect your wallet first by visiting your profile.
Try: "go to profile"`,
      });
    }

    // ==================== ABOUT COMMAND ====================
    if (lowerCommand === "about" || lowerCommand === "info") {
      return NextResponse.json({
        success: true,
        action: "info",
        message: `EmpowerTours - Agent World on Monad

🌍 An AI Agent ecosystem featuring:
- Agent World with 15+ on-chain actions
- Travel passport NFTs (195 countries!)
- Music NFTs with artist royalties
- Community radio with TOURS rewards
- DAO governance with vTOURS voting

💎 Tokens:
- TOURS: Ecosystem rewards & governance
- EMPTOURS: Community token on nad.fun

Built on Monad Mainnet | Gasless transactions
Try "help" to see all commands!`,
      });
    }

    // ==================== TIP ARTIST COMMAND ====================
    if (
      lowerCommand.startsWith("tip artist") ||
      lowerCommand.startsWith("tip ")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message:
            "Wallet not connected. Visit the app to connect your wallet first.",
        });
      }

      // Parse: "tip artist 0x... 10" or "tip 0x... 5"
      const tipMatch = originalCommand.match(
        /tip\s+(?:artist\s+)?(0x[a-fA-F0-9]{40})\s+([\d.]+)/i,
      );
      if (!tipMatch) {
        return NextResponse.json({
          success: false,
          message:
            'Invalid format. Use: "tip artist 0xArtistAddress 10" (amount in TOURS)',
        });
      }

      const artistAddress = tipMatch[1];
      const tipAmount = tipMatch[2];

      try {
        const tipRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "tip-artist",
            params: {
              artistAddress,
              amount: tipAmount,
            },
          }),
        });

        const tipData = await tipRes.json();

        if (!tipData.success) {
          return NextResponse.json({
            success: false,
            message: `Tip failed: ${tipData.error}`,
          });
        }

        return NextResponse.json({
          success: true,
          action: "transaction",
          message: `🎵 **Artist Tipped!**

Sent ${tipAmount} TOURS to ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}
TX: ${tipData.txHash?.slice(0, 14)}...

Thanks for supporting artists! 💎`,
          txHash: tipData.txHash,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Tip failed: ${err.message}`,
        });
      }
    }

    // ==================== QUEUE SONG COMMAND ====================
    if (
      lowerCommand.startsWith("queue song") ||
      lowerCommand.startsWith("queue ")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message:
            "Wallet not connected. Visit the app to connect your wallet first.",
        });
      }

      // Parse: "queue song 5" or "queue 5"
      const queueMatch = lowerCommand.match(/queue\s+(?:song\s+)?(\d+)/i);
      if (!queueMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "queue song <tokenId>"',
        });
      }

      const tokenId = queueMatch[1];

      try {
        const queueRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "radio_queue_song",
            params: { tokenId },
          }),
        });

        const queueData = await queueRes.json();

        if (!queueData.success) {
          return NextResponse.json({
            success: false,
            message: `Queue failed: ${queueData.error}`,
          });
        }

        return NextResponse.json({
          success: true,
          action: "transaction",
          message: `🎵 **Song Queued!**

Token #${tokenId} added to the radio queue.
TX: ${queueData.txHash?.slice(0, 14)}...

🎧 Listen: https://fcempowertours.vercel.app/radio`,
          txHash: queueData.txHash,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Queue failed: ${err.message}`,
        });
      }
    }

    // ==================== BALANCE CHECK ====================
    // Skip if it's "my balance" (handled by Discord-specific handler below)
    if (
      (lowerCommand.includes("balance") || lowerCommand === "check balance") &&
      !lowerCommand.startsWith("my balance") &&
      !lowerCommand.startsWith("discord balance")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Please connect your wallet first. Try: "go to profile"',
        });
      }
      try {
        const response = await fetch(`${APP_URL}/api/get-balances`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({ address: userAddress }),
        });
        const data = await response.json();
        return NextResponse.json({
          success: true,
          action: "info",
          message: `Your Balances
MON: ${data.mon || "0.0000"} MON
TOURS: ${data.tours || "0"} TOURS
NFTs: ${data.nfts?.totalNFTs || 0} total
Address: ${userAddress.slice(0, 10)}...`,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to check balance: ${err.message}`,
        });
      }
    }

    // ==================== BUY NFT COMMAND (GASLESS VIA DELEGATION + CAST) ====================
    // Supports: buy music, buy song, buy art
    if (
      lowerCommand.includes("buy music") ||
      lowerCommand.includes("buy song") ||
      lowerCommand.includes("buy art")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }

      // Try to match tokenId first (e.g., "buy music 1", "buy art 4")
      const tokenIdMatch = lowerCommand.match(/buy (?:music|song|art) (\d+)/);
      let tokenId = tokenIdMatch ? parseInt(tokenIdMatch[1]) : null;
      let songTitle = null;
      let isArtNFT = lowerCommand.includes("buy art"); // Pre-set if command explicitly says "buy art"

      // ✅ If no tokenId, try to match song name
      if (!tokenId) {
        const songNameMatch = originalCommand.match(/buy song (.+)/i);
        if (songNameMatch) {
          const searchSongName = songNameMatch[1].trim();
          console.log(`[BOT] Searching for NFT: "${searchSongName}"`);

          try {
            // Search the resolved catalogue rather than the indexer. With five masters this is
            // a find() over an already-cached list, and it keeps working when the indexer is
            // stale — which it has been since 2026-08-01.
            const { tracks } = await getResolvedCatalogue();
            const needle = searchSongName.toLowerCase();

            // Exact match first, so "Killah" cannot be beaten by a longer title containing it.
            const match =
              tracks.find((t) => t.name.toLowerCase() === needle) ??
              tracks.find((t) => t.name.toLowerCase().includes(needle));

            if (!match) {
              return NextResponse.json({
                success: false,
                message: `NFT "${searchSongName}" not found. Try: "buy music <tokenId>" or browse on /discover`,
              });
            }

            tokenId = parseInt(String(match.tokenId));
            songTitle = match.name;
            isArtNFT = match.isArt === true;
            console.log(
              `[BOT] Found "${songTitle}" with tokenId: ${tokenId} (isArt: ${isArtNFT})`,
            );
          } catch (searchErr: any) {
            console.error("[BOT] NFT search error:", searchErr);
            return NextResponse.json({
              success: false,
              message: `Failed to search for NFT: ${searchErr.message}`,
            });
          }
        }
      }

      if (!tokenId) {
        return NextResponse.json({
          success: false,
          message:
            'Invalid format. Use: "buy music <tokenId>", "buy art <tokenId>", or "buy song <Song Name>"',
        });
      }

      try {
        // Confirm the NFT type when the buy came in by token id rather than by name, where
        // the search above already knew it.
        if (!isArtNFT) {
          try {
            const track = await getResolvedTrack(tokenId);
            if (track) isArtNFT = track.isArt === true;
          } catch {
            console.warn("Could not check NFT type, assuming music");
          }
        }

        const nftType = isArtNFT ? "Art NFT" : "Music License";
        console.log(`Action: buy_${isArtNFT ? "art" : "music"}`);
        console.log(`[BOT] Buying ${nftType} for token ${tokenId}`);
        const delegationRes = await fetch(
          `${APP_URL}/api/delegation-status?address=${userAddress}`,
        );
        const delegationData = await delegationRes.json();
        const hasValidDelegation =
          delegationData.success &&
          delegationData.delegation &&
          Array.isArray(delegationData.delegation.permissions) &&
          delegationData.delegation.permissions.includes("buy_music");
        if (!hasValidDelegation) {
          console.warn(
            "[BOT] No delegation with buy_music permission - creating one...",
          );
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              authMethod: "farcaster",
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: [
                "buy_music",
                "send_tours",
                "mint_passport",
                "wrap_mon",
                "mint_music",
              ],
            }),
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error("Failed to create delegation: " + createData.error);
          }
          console.log("[BOT] Delegation created with buy_music permission");
        }

        const buyRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "buy_music",
            params: {
              tokenId: tokenId.toString(),
              songTitle: songTitle,
              fid, // ✅ PASS FID FOR CASTING
            },
          }),
        });

        const buyData = await buyRes.json();
        if (!buyData.success) {
          throw new Error(buyData.error || "Purchase failed");
        }

        console.log("Music purchased:", buyData.txHash);
        return NextResponse.json({
          success: true,
          txHash: buyData.txHash,
          action: "buy_music",
          message: `Music License Purchased (FREE)!
Track #${tokenId} is now yours!
TX: ${buyData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://monadscan.com/tx/${buyData.txHash}`,
        });
      } catch (error: any) {
        console.error("Buy music failed:", error);
        return NextResponse.json({
          success: false,
          message: `Purchase failed: ${error.message}`,
        });
      }
    }

    // ==================== SEND TOURS COMMAND ====================
    if (lowerCommand.includes("send") && lowerCommand.includes("tours")) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }
      try {
        const amountMatch = lowerCommand.match(/send\s+([\d.]+)\s+tours/);
        const recipientMatch = lowerCommand.match(
          /to\s+(@[\w]+|0x[a-fA-F0-9]{40})/,
        );
        if (!amountMatch || !recipientMatch) {
          return NextResponse.json({
            success: false,
            message:
              'Invalid format. Use: "send 10 tours to @username" or "send 10 tours to 0x..."',
          });
        }
        const amount = parseFloat(amountMatch[1]);
        let recipient = recipientMatch[1];
        if (amount <= 0 || amount > 10000) {
          return NextResponse.json({
            success: false,
            message: "Invalid amount. Please use 0.01 - 10000 TOURS",
          });
        }
        if (recipient.startsWith("@")) {
          console.log("Resolving Farcaster username:", recipient);
          try {
            const username = recipient.slice(1);
            const neynarRes = await fetch(
              `https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`,
              {
                headers: {
                  api_key:
                    process.env.NEYNAR_API_KEY ||
                    process.env.NEXT_PUBLIC_NEYNAR_API_KEY ||
                    "",
                },
              },
            );
            if (!neynarRes.ok) {
              throw new Error(
                `User @${username} not found on Farcaster (HTTP ${neynarRes.status})`,
              );
            }
            const neynarData = await neynarRes.json();
            const userData =
              neynarData.result?.user || neynarData.user || neynarData;
            let ethAddresses = null;
            if (userData.verified_addresses?.eth_addresses) {
              ethAddresses = userData.verified_addresses.eth_addresses;
            } else if (userData.verifiedAddresses?.eth_addresses) {
              ethAddresses = userData.verifiedAddresses.eth_addresses;
            } else if (userData.verifiedAddresses?.ethAddresses) {
              ethAddresses = userData.verifiedAddresses.ethAddresses;
            } else if (userData.custody_address) {
              ethAddresses = [userData.custody_address];
            } else if (userData.custodyAddress) {
              ethAddresses = [userData.custodyAddress];
            }
            if (ethAddresses && ethAddresses.length > 0) {
              recipient = ethAddresses[0];
              console.log("Resolved @" + username + " to:", recipient);
            } else {
              throw new Error(`No verified address for @${username}`);
            }
          } catch (resolveErr: any) {
            return NextResponse.json({
              success: false,
              message: `Failed to find user ${recipient}: ${resolveErr.message}`,
            });
          }
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          return NextResponse.json({
            success: false,
            message: "Invalid recipient address format",
          });
        }
        console.log(`Sending ${amount} TOURS to ${recipient}`);
        const delegationRes = await fetch(
          `${APP_URL}/api/delegation-status?address=${userAddress}`,
        );
        const delegationData = await delegationRes.json();
        const hasValidDelegation =
          delegationData.success &&
          delegationData.delegation &&
          Array.isArray(delegationData.delegation.permissions) &&
          delegationData.delegation.permissions.includes("send_tours");
        if (!hasValidDelegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              authMethod: "farcaster",
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: [
                "send_tours",
                "mint_passport",
                "wrap_mon",
                "mint_music",
                "buy_music",
              ],
            }),
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error("Failed to create delegation: " + createData.error);
          }
        }
        const sendRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "send_tours",
            params: {
              recipient,
              amount: amount.toString(),
            },
          }),
        });
        const sendData = await sendRes.json();
        if (!sendData.success) {
          throw new Error(sendData.error || "Send failed");
        }
        console.log("TOURS sent:", sendData.txHash);
        return NextResponse.json({
          success: true,
          txHash: sendData.txHash,
          action: "transaction",
          message: `Sent ${amount} TOURS! (FREE)
To: ${recipient.slice(0, 6)}...${recipient.slice(-4)}
TX: ${sendData.txHash?.slice(0, 10)}...
Gasless - we paid the fees!
View: https://monadscan.com/tx/${sendData.txHash}`,
        });
      } catch (error: any) {
        console.error("Send TOURS failed:", error);
        return NextResponse.json({
          success: false,
          message: `Send failed: ${error.message}`,
        });
      }
    }

    // ==================== SEND MON COMMAND ====================
    if (
      lowerCommand.includes("send") &&
      lowerCommand.includes("mon") &&
      !lowerCommand.includes("tours")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }
      try {
        const amountMatch = lowerCommand.match(/send\s+([\d.]+)\s+mon/);
        const recipientMatch = lowerCommand.match(/to\s+(0x[a-fA-F0-9]{40})/);
        if (!amountMatch || !recipientMatch) {
          return NextResponse.json({
            success: false,
            message:
              'Invalid format. Use: "send 1.5 mon to 0x..." (MON transfers require exact address)',
          });
        }
        const amount = parseFloat(amountMatch[1]);
        const recipient = recipientMatch[1].toLowerCase();
        if (amount <= 0 || amount > 1000) {
          return NextResponse.json({
            success: false,
            message: "Invalid amount. Please use 0.01 - 1000 MON",
          });
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          return NextResponse.json({
            success: false,
            message: "Invalid recipient address format",
          });
        }

        // ✅ MON transfers come from USER's wallet via Privy connection
        // Redirect to /send-mon page where user can connect with Farcaster and send
        console.log(`Preparing MON transfer: ${amount} MON to ${recipient}`);

        const sendMonUrl = `${APP_URL}/send-mon?amount=${amount}&to=${recipient}&from=${userAddress}`;

        return NextResponse.json({
          success: true,
          action: "redirect",
          url: sendMonUrl,
          message: `📤 Send ${amount} MON

From your wallet to:
${recipient.slice(0, 6)}...${recipient.slice(-4)}

Click below to open the transaction page and connect your Farcaster wallet with Privy.`,
        });
      } catch (error: any) {
        console.error("Send MON failed:", error);
        return NextResponse.json({
          success: false,
          message: `Send failed: ${error.message}`,
        });
      }
    }

    // ==================== MINT PASSPORT COMMAND (WITH DUPLICATE CHECK + CAST) ====================
    if (lowerCommand.includes("mint passport")) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }
      try {
        console.log("[BOT] Minting passport for:", userAddress);

        // 🔥 CRITICAL: Detect country FIRST
        let countryCode = "US";
        let countryName = "United States";
        try {
          const geoRes = await fetch(`${APP_URL}/api/geo`, {
            headers: {
              "x-forwarded-for": req.headers.get("x-forwarded-for") || "",
              "x-real-ip": req.headers.get("x-real-ip") || "",
              "cf-connecting-ip": req.headers.get("cf-connecting-ip") || "",
            },
          });
          const geoData = await geoRes.json();
          countryCode = geoData.country || "US";
          countryName = geoData.country_name || "United States";
          console.log(`📍 Detected country: ${countryCode} ${countryName}`);
        } catch {
          console.warn("Location detection failed, using default");
        }

        // ✅ QUERY INDEXER: Check if user already owns a passport for this country
        console.log(
          `🔍 Checking if user has existing passport for ${countryCode}...`,
        );
        try {
          // Ask the contract, which is the thing that will actually reject a duplicate. The
          // indexer's passport entry is two contract generations behind — named V2, pointed at
          // V3, live contract is V4 — so it reported "no passport" for every V4 holder and let
          // duplicates through to revert on chain. `findAllPassports` narrowed to one country is
          // a single read.
          const PASSPORT_NFT_ADDRESS = process.env
            .NEXT_PUBLIC_PASSPORT_NFT as Address;

          const passportClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          }) as PublicClient;

          const existing = await findAllPassports(passportClient, {
            passportAddress: PASSPORT_NFT_ADDRESS,
            countryCodes: [countryCode.toUpperCase()],
            address: userAddress as Address,
          });

          const existingPassport = existing[0];

          if (existingPassport) {
            console.warn(
              `⚠️ User already owns passport for ${countryCode}:`,
              existingPassport,
            );
            return NextResponse.json({
              success: false,
              message: `You already own a passport for ${countryCode} ${countryName}!
Token #${existingPassport.tokenId}
You can only mint one passport per country.
Try "mint passport" from a different location or "help" for other commands.`,
            });
          }

          console.log(
            `✅ No existing passport found for ${countryCode} - proceeding with mint`,
          );
        } catch (checkErr: any) {
          console.warn("⚠️ Passport duplicate check failed:", checkErr.message);
          // Don't block on check failure - continue with mint
        }

        // ✅ PROCEED: User doesn't have passport for this country
        const delegationRes = await fetch(
          `${APP_URL}/api/delegation-status?address=${userAddress}`,
        );
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              authMethod: "farcaster",
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: [
                "mint_passport",
                "wrap_mon",
                "mint_music",
                "send_tours",
                "buy_music",
              ],
            }),
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error("Failed to create delegation: " + createData.error);
          }
        }

        let mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "mint_passport",
            params: {
              countryCode,
              countryName,
              fid, // ✅ PASS FID FOR CASTING
            },
          }),
        });
        let mintData = await mintRes.json();

        // ✅ AUTO-WRAP: If needs WMON, wrap MON first then retry mint
        if (!mintData.success && mintData.needsWrap) {
          console.log(
            "[BOT] Need to wrap MON first, amount:",
            mintData.wmonNeeded,
          );

          const wrapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              action: "wrap_mon",
              params: { amount: mintData.wmonNeeded },
            }),
          });

          const wrapData = await wrapRes.json();
          if (!wrapData.success) {
            throw new Error(wrapData.error || "Failed to wrap MON");
          }
          console.log("[BOT] Wrapped MON, now minting...");

          // Retry mint after wrap
          mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              action: "mint_passport",
              params: {
                countryCode,
                countryName,
                fid,
              },
            }),
          });
          mintData = await mintRes.json();
        }

        if (!mintData.success) {
          throw new Error(mintData.error || "Mint failed");
        }
        console.log("[BOT] Passport minted:", mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: "transaction",
          message: `Passport Minted Successfully! 🎫

${countryCode} ${countryName}

Gasless transaction - we paid the gas!

View on Monadscan:
https://monadscan.com/tx/${mintData.txHash}`,
        });
      } catch (error: any) {
        console.error("[BOT] Passport mint error:", error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`,
        });
      }
    }

    // ==================== MINT MUSIC COMMAND (WITH CAST) ====================
    if (lowerCommand.includes("mint music")) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }
      try {
        const regex =
          /mint[_ ]music\s+(.+?)\s+(ipfs:\/\/[a-zA-Z0-9]{46,})\s+([\d.]+)/i;
        const match = originalCommand.match(regex);

        if (!match) {
          return NextResponse.json({
            success: true,
            action: "info",
            message: `Music NFT Minting
To mint music, use:
"mint music <Song Name> <ipfs://metadata> <price>"
Example:
"mint music My First Song ipfs://QmXXX... 1"
Or go to the Music page to upload files.`,
          });
        }

        const songTitle = match[1].trim();
        const tokenURI = match[2];
        const price = parseFloat(match[3]);

        const cid = tokenURI.replace("ipfs://", "");
        if (!cid.startsWith("Qm") && !cid.startsWith("bafy")) {
          return NextResponse.json({
            success: false,
            message: `Invalid IPFS CID format: ${cid}. Must start with Qm or bafy`,
          });
        }

        console.log(
          `[BOT] Minting ${is_art ? "ART" : "MUSIC"} NFT with CASE-PRESERVED CID:`,
          {
            title: songTitle,
            tokenURI,
            price,
            imageUrl: imageUrlFromRequest,
            isArt: is_art,
          },
        );

        if (price <= 0 || price > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: "Invalid price. Use: 0.001 - 100,000,000 WMON",
          });
        }

        const delegationRes = await fetch(
          `${APP_URL}/api/delegation-status?address=${userAddress}`,
        );
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              authMethod: "farcaster",
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: [
                "mint_music",
                "mint_passport",
                "wrap_mon",
                "send_tours",
                "buy_music",
              ],
            }),
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error("Failed to create delegation: " + createData.error);
          }
        }

        const mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({
            userAddress,
            action: "mint_music",
            params: {
              songTitle,
              tokenURI,
              imageUrl: imageUrlFromRequest, // ✅ PASS: Direct cover image URL from upload
              price: price.toString(),
              fid, // ✅ PASS FID FOR CASTING
              is_art, // ✅ PASS: NFT type for conditional cast
              rightsDeclaration: rightsDeclarationFromRequest, // ✅ PASS: Rights declaration for Redis storage
              // Relayed through untouched. execute-delegated re-parses and validates them —
              // this route must not be the thing that decides a signature is acceptable.
              mintRequest: mintRequestFromRequest,
              mintSignature: mintSignatureFromRequest,
            },
          }),
        });
        const mintData = await mintRes.json();
        if (!mintData.success) {
          throw new Error(mintData.error || "Mint failed");
        }
        console.log("[BOT] Music NFT minted:", mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: "transaction",
          message: `Music NFT Minted (FREE)!
Song: ${songTitle}
Price: ${price} WMON per license
TX: ${mintData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://monadscan.com/tx/${mintData.txHash}`,
        });
      } catch (error: any) {
        console.error("[BOT] Music mint error:", error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`,
        });
      }
    }

    // ==================== MINT COLLECTOR EDITION COMMAND ====================
    if (
      lowerCommand.includes("mint collector") ||
      lowerCommand.includes("mint_collector")
    ) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"',
        });
      }
      try {
        const collectorRegex =
          /mint[_ ]collector\s+(.+?)\s+(ipfs:\/\/[a-zA-Z0-9]{46,})\s+([\d.]+)/i;
        const collectorMatch = originalCommand.match(collectorRegex);

        if (!collectorMatch) {
          return NextResponse.json({
            success: true,
            action: "info",
            message: `Collector Edition NFT Minting
To mint a collector edition, use the NFT creation page with the collector toggle enabled.`,
          });
        }

        const collectorTitle = collectorMatch[1].trim();
        const collectorTokenURIVal = collectorMatch[2];
        const collectorStdPrice = parseFloat(collectorMatch[3]);

        // Get collector-specific params from request body context
        const collectorTokenURI =
          body.collectorTokenURI || collectorTokenURIVal;
        const collectorPriceVal = body.collectorPrice || "500";
        const maxEditionsVal = body.maxEditions || "100";
        const imageUrlFromCollector = body.imageUrl || "";
        const is_collector_art = body.is_art;

        const cid = collectorTokenURIVal.replace("ipfs://", "");
        if (!cid.startsWith("Qm") && !cid.startsWith("bafy")) {
          return NextResponse.json({
            success: false,
            message: `Invalid IPFS CID format: ${cid}. Must start with Qm or bafy`,
          });
        }

        if (collectorStdPrice <= 0 || collectorStdPrice > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: "Invalid price. Use: 0.001 - 100,000,000 WMON",
          });
        }

        const cPrice = parseFloat(collectorPriceVal);
        if (isNaN(cPrice) || cPrice < 500 || cPrice > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: "Collector price must be between 500 and 100,000,000 WMON",
          });
        }

        const cEditions = parseInt(maxEditionsVal);
        if (isNaN(cEditions) || cEditions < 1 || cEditions > 1000) {
          return NextResponse.json({
            success: false,
            message: "Max editions must be between 1 and 1,000",
          });
        }

        console.log(`[BOT] Minting COLLECTOR EDITION NFT:`, {
          title: collectorTitle,
          tokenURI: collectorTokenURIVal,
          standardPrice: collectorStdPrice,
          collectorPrice: collectorPriceVal,
          maxEditions: maxEditionsVal,
        });

        // Create delegation if needed
        const delegationRes = await fetch(
          `${APP_URL}/api/delegation-status?address=${userAddress}`,
        );
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              authMethod: "farcaster",
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: [
                "mint_music",
                "mint_collector",
                "mint_passport",
                "wrap_mon",
                "send_tours",
                "buy_music",
              ],
            }),
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error("Failed to create delegation: " + createData.error);
          }
        }

        const mintCollectorRes = await fetch(
          `${APP_URL}/api/execute-delegated`,
          {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({
              userAddress,
              action: "mint_collector",
              params: {
                songTitle: collectorTitle,
                tokenURI: collectorTokenURIVal,
                collectorTokenURI,
                imageUrl: imageUrlFromCollector,
                price: collectorStdPrice.toString(),
                collectorPrice: collectorPriceVal,
                maxEditions: maxEditionsVal,
                fid,
                is_art: is_collector_art,
              },
            }),
          },
        );
        const mintCollectorData = await mintCollectorRes.json();
        if (!mintCollectorData.success) {
          throw new Error(mintCollectorData.error || "Collector mint failed");
        }
        console.log("[BOT] Collector NFT minted:", mintCollectorData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintCollectorData.txHash,
          tokenId: mintCollectorData.tokenId,
          action: "transaction",
          message: `Collector Edition NFT Minted (FREE)!
Title: ${collectorTitle}
Standard: ${collectorStdPrice} WMON | Collector: ${collectorPriceVal} WMON (${maxEditionsVal} editions)
TX: ${mintCollectorData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://monadscan.com/tx/${mintCollectorData.txHash}`,
        });
      } catch (error: any) {
        console.error("[BOT] Collector mint error:", error);
        return NextResponse.json({
          success: false,
          message: `Collector mint failed: ${error.message}`,
        });
      }
    }

    // ==================== BURN MUSIC COMMAND ====================
    if (
      lowerCommand.includes("burn music") ||
      lowerCommand.includes("burn song")
    ) {
      const tokenIdMatch = lowerCommand.match(/burn (?:music|song) (\d+)/);
      if (!tokenIdMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "burn music <tokenId>"',
        });
      }

      const tokenId = tokenIdMatch[1];
      console.log("[BOT] Redirecting to burn page for token:", tokenId);

      return NextResponse.json({
        success: true,
        action: "navigate",
        path: `/burn-music?tokenId=${tokenId}`,
        message: `🔥 Burn NFT #${tokenId}

Opening burn page where you can burn your NFT and receive 5 TOURS reward.

Note: You'll pay a small gas fee to burn the NFT.`,
      });
    }

    // ==================== NAVIGATION COMMANDS ====================
    const navCommands: Record<string, string> = {
      "go to passport": "/passport",
      passport: "/passport",
      "go to music": "/music",
      music: "/music",
      "go to discover": "/discover",
      discover: "/discover",
      "browse music": "/discover",
      "go to profile": "/profile",
      profile: "/profile",
      "my profile": "/profile",
      "go to dashboard": "/dashboard",
      dashboard: "/dashboard",
      stats: "/dashboard",
      "go home": "/",
      home: "/",
    };
    for (const [cmd, path] of Object.entries(navCommands)) {
      if (lowerCommand.includes(cmd)) {
        return NextResponse.json({
          success: true,
          action: "navigate",
          path,
          message: `Navigating to ${path}...`,
        });
      }
    }

    // ==================== UNKNOWN COMMAND ====================
    return NextResponse.json({
      success: false,
      message: `Command not recognized: "${command}"
Try "help" to see all available commands!`,
    });
  } catch (error: any) {
    console.error("Bot command error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error processing command. Please try again.",
      },
      { status: 500 },
    );
  }
}
// Deploy trigger Tue Feb  3 11:34:27 CST 2026
