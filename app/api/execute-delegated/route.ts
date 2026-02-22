import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { sendUserSafeTransaction, getUserSafeAddress, checkUserSafeBalance, ensureUserSafeCanBurn } from '@/lib/user-safe';
import { USE_USER_SAFES } from '@/lib/safe-mode';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi, formatEther } from 'viem';
import { createShortUrl } from '@/lib/url-shortener';
// Switchboard removed - using Pyth Entropy for randomness
import { activeChain } from '@/app/chains';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import { validateCountryCode, sanitizeInput, sanitizeErrorForResponse, VALID_COUNTRY_CODES } from '@/lib/auth';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

// Type definition for Safe transaction calls
type Call = { to: Address; value: bigint; data: Hex };

// ✅ Helper: Execute transaction through appropriate Safe (user-funded or platform)
async function executeTransaction(
  calls: Array<{ to: Address; value: bigint; data: Hex }>,
  userAddress: Address,
  requiredValue: bigint = 0n
): Promise<string> {
  if (USE_USER_SAFES) {
    // User-funded Safe mode - ensure registered on V2 contracts first
    const { ensureUserSafeRegistered } = await import('@/lib/user-safe');
    await ensureUserSafeRegistered(userAddress as string);

    const userSafeAddress = await getUserSafeAddress(userAddress);
    console.log(`🏠 Using USER Safe: ${userSafeAddress}`);

    // Check if user Safe has sufficient balance
    const balanceCheck = await checkUserSafeBalance(userAddress, requiredValue);
    if (!balanceCheck.hasSufficientBalance) {
      throw new Error(
        `Insufficient balance in your Safe wallet (${balanceCheck.currentBalance} MON). ` +
        `Required: ${balanceCheck.requiredBalance} MON. ` +
        `Please fund your Safe at ${userSafeAddress} with at least ${balanceCheck.shortfall} more MON.`
      );
    }

    const result = await sendUserSafeTransaction(userAddress, calls);
    return result.txHash;
  } else {
    // Platform-funded Safe mode (original behavior)
    console.log(`🏢 Using PLATFORM Safe: ${SAFE_ACCOUNT}`);
    return sendSafeTransaction(calls);
  }
}

// ✅ Helper: Convert price from wei (18 decimals) to readable TOURS
function convertPriceFromWei(price: string | number | bigint): string {
  try {
    const priceBI = BigInt(price);
    const priceNum = Number(priceBI) / 1e18;
    return priceNum.toString();
  } catch (e) {
    console.warn('Failed to convert price:', price);
    return String(price);
  }
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Rate limiting
    const ip = getClientIP(req);

    const { userAddress, action, params, fid } = await req.json();
    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    // SECURITY: Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // SECURITY: Rate limit check
    const rateLimit = await checkRateLimit(RateLimiters.execute, ip, userAddress);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    // Public actions that don't require delegation (anyone can call to earn rewards)
    // Also includes lottery entry actions for frictionless user experience
    const publicActions = [
      'lottery_claim',
      'lottery_enter_mon',
      'lottery_enter_wmon',    // WMON lottery entry
      'daily_lottery_buy',     // DailyLottery: buy tickets with WMON (Pyth Entropy)
      'daily_lottery_draw',    // DailyLottery: request draw (pays Pyth Entropy fee)
      'music-subscribe',       // Daily gate requirement
      'faucet_claim',          // WMON faucet claim
      'mint_passport',         // Daily gate requirement
      'buy_music',             // Purchase music NFT license
      'buy_art',               // Purchase art NFT
      'dao_wrap',              // Wrap TOURS to vTOURS for DAO voting
      'dao_unwrap',            // Unwrap vTOURS back to TOURS
      'dao_delegate',          // Delegate voting power
      'dao_fund_safe',         // Fund user Safe with TOURS from platform
      'dao_create_burn_proposal', // Create proposal to burn stolen/infringing NFT
      'dao_create_deployment_proposal', // Create DAO deployment proposal (factory + governor)
      'dao_vote_proposal',       // Cast vote on Governor proposal
      'dao_queue_proposal',      // Queue passed proposal in Timelock
      'dao_execute_proposal',    // Execute after timelock delay
      'radio_voice_note',      // Live radio voice shoutout/ad payment
      'radio_queue_song',      // Live radio song queue on-chain
      'radio_claim_rewards',   // Live radio TOURS rewards claim
      'radio_mark_played',     // Live radio mark song as played (scheduler)
      'radio_skip_random',     // Live radio skip to random (Pyth Entropy) - user pays 1 MON
      'radio_start',           // Start live radio (onlyOwnerOrDAO - platform Safe)
      'mirrormate_register',   // Register as tour guide
      'mirrormate_update',     // Update guide profile
      'mirrormate_skip',       // Skip guide in matching
      'mirrormate_connect',    // Request connection with guide
      'maps_payment',          // Google Maps query payment (from user Safe)
      'withdraw_to_user',      // Withdraw from own Safe to own wallet
      'create_climb',          // Create climbing location (35 WMON)
      'purchase_climb',        // Purchase climbing location access
      'flip_coin',             // Play flip coin game (external contract)
      'vault_deposit',         // Agent Vault: deposit WMON into AI vault
      'vault_withdraw',        // Agent Vault: withdraw shares from AI vault
      'vault_emergency_withdraw', // Agent Vault: emergency withdraw (dormant agents only)
      'platform_send_mon',     // Admin: send native MON from Platform Safe to any address
      'studio_pay',            // EmpowerStudio AI feature payment
      'studio_mint_remix',     // EmpowerStudio mint remix NFT
      'claim_artist_payouts',  // Claim subscription artist payouts (WMON + TOURS)
      'mint_collector',        // Mint collector edition NFT
      'send_tours',            // Transfer TOURS tokens
      'send_mon',              // Transfer native MON
      'swap_mon_for_tours',    // Swap MON for TOURS
      'wrap_mon',              // Wrap MON to WMON
      'approve_wmon_for_passport', // Approve WMON for passport mint
      'stake_music',           // Stake music NFT for rewards
      'unstake_music',         // Unstake music NFT and claim rewards
      'burn_music',            // Burn music NFT
      'burn_nft',              // Generic NFT burn
      'create_experience',     // Create experience NFT
      'create_single_experience', // Create single experience
      'mint_itinerary',        // Mint itinerary NFT
      'purchase_itinerary',    // Purchase itinerary access
      'checkin_itinerary',     // Check in to itinerary location
      'complete_location',     // Mark location as complete
      'burn_itinerary',        // Burn itinerary NFT
      'buy_resale',            // Purchase resale NFT from secondary market
      'book_guide',            // Book a MirrorMate tour guide
      'mark_tour_complete',    // Mark tour as completed
      'confirm_and_rate',      // Confirm and rate experience
    ];
    const requiresDelegation = !publicActions.includes(action);

    if (requiresDelegation) {
      console.log('🎫 [DELEGATED] Checking delegation for:', userAddress);

      // ✅ RETRY MECHANISM: Handle potential Redis eventual consistency
      let delegation = null;
      let retries = 3;

      while (retries > 0 && !delegation) {
        delegation = await getDelegation(userAddress);

        if (delegation) {
          console.log('✅ Delegation found:', {
            user: delegation.user,
            expires: new Date(delegation.expiresAt).toISOString(),
            permissions: delegation.config.permissions.length,
            transactionsExecuted: delegation.transactionsExecuted
          });
        } else {
          retries--;
          if (retries > 0) {
            console.log(`⏳ Delegation not found, retrying in 500ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (!delegation || delegation.expiresAt < Date.now()) {
        console.error('❌ No valid delegation found after retries for:', userAddress);
        return NextResponse.json(
          { success: false, error: 'No active delegation. Please try again or refresh the page to create a new delegation.' },
          { status: 403 }
        );
      }

      if (!(await hasPermission(userAddress, action))) {
        return NextResponse.json(
          { success: false, error: `No permission for ${action}` },
          { status: 403 }
        );
      }

      if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
        return NextResponse.json(
          { success: false, error: 'Transaction limit reached' },
          { status: 403 }
        );
      }

      console.log('✅ Delegation valid, transactions left:',
        delegation.config.maxTransactions - delegation.transactionsExecuted);
    } else {
      console.log('🌐 [PUBLIC ACTION] Bypassing delegation check for:', action);
    }

    const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
    const EMPOWER_TOURS_NFT = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address; // EmpowerToursNFTv10
    const TOKEN_SWAP = process.env.TOKEN_SWAP_ADDRESS as Address;
    // Note: Passport minting uses 150 WMON (wrapped MON token)


    switch (action) {
      // ==================== MINT PASSPORT (WITH CAST + FRAME) ====================
      case 'mint_passport':
        console.log('🎫 Action: mint_passport (batched approve + mint)');

        // ✅ VALIDATION: Check if contracts are deployed
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          console.log('🔍 Validating contract deployments...');

          // Check TOURS token
          const toursCode = await client.getCode({ address: TOURS_TOKEN });
          if (!toursCode || toursCode === '0x') {
            throw new Error(`TOURS token at ${TOURS_TOKEN} is not deployed!`);
          }
          console.log('✅ TOURS token is deployed');

          // Check Passport NFT
          const passportCode = await client.getCode({ address: PASSPORT_NFT });
          if (!passportCode || passportCode === '0x') {
            throw new Error(`Passport NFT at ${PASSPORT_NFT} is not deployed!`);
          }
          console.log('✅ Passport NFT is deployed');

          // Check Safe account
          const safeCode = await client.getCode({ address: SAFE_ACCOUNT });
          if (!safeCode || safeCode === '0x') {
            throw new Error(`Safe account at ${SAFE_ACCOUNT} is not deployed!`);
          }
          console.log('✅ Safe account is deployed');
        } catch (validationErr: any) {
          console.error('❌ Contract validation failed:', validationErr.message);
          return NextResponse.json(
            {
              success: false,
              error: `Contract validation failed: ${validationErr.message}. Please ensure all contracts are deployed on chain ${activeChain.id} (${activeChain.name}).`
            },
            { status: 500 }
          );
        }

        // Check Safe's WMON balance - Passport requires 150 WMON
        // If not enough WMON, check if we can wrap MON to WMON
        let needsWrap = false;
        const WMON_CHECK = process.env.NEXT_PUBLIC_WMON as Address;
        const MINT_PRICE_CHECK = parseEther('150');

        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const mintSafeAddress = USE_USER_SAFES
            ? await getUserSafeAddress(userAddress as Address)
            : SAFE_ACCOUNT;

          const wmonBalance = await client.readContract({
            address: WMON_CHECK,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [mintSafeAddress],
          }) as bigint;

          console.log('⛽ Safe WMON balance:', wmonBalance.toString());

          if (wmonBalance < MINT_PRICE_CHECK) {
            // Check MON balance to see if we can wrap
            const monBalance = await client.getBalance({ address: mintSafeAddress });
            console.log('⛽ Safe MON balance:', monBalance.toString());

            const wmonNeeded = MINT_PRICE_CHECK - wmonBalance;
            if (monBalance >= wmonNeeded) {
              console.log('💡 Will wrap', (Number(wmonNeeded) / 1e18).toFixed(2), 'MON to WMON');
              needsWrap = true;
            } else {
              const totalNeeded = Number(MINT_PRICE_CHECK) / 1e18;
              const haveWmon = Number(wmonBalance) / 1e18;
              const haveMon = Number(monBalance) / 1e18;
              return NextResponse.json({
                success: false,
                error: `Insufficient funds. Need 150 WMON. Safe has ${haveWmon.toFixed(2)} WMON + ${haveMon.toFixed(2)} MON.`
              }, { status: 400 });
            }
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check balance:', balanceErr);
        }

        // 🔍 DEBUG: Log the actual addresses and amounts involved
        console.log('🔍 [MINT-DEBUG] Transaction details:', {
          safeAccount: SAFE_ACCOUNT,
          userAddress: userAddress,
          passportNFT: PASSPORT_NFT,
          mintPriceWMON: '150 WMON',
          countryCode: params?.countryCode || 'US',
        });

        // ✅ PRE-CHECK: Verify user doesn't already have passport for this country
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const checkClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const countryCode = params?.countryCode || 'US';

          // SECURITY: Validate country code format
          const countryValidation = validateCountryCode(countryCode);
          if (!countryValidation.valid) {
            return NextResponse.json({
              success: false,
              error: countryValidation.error,
            }, { status: 400 });
          }

          const hasExistingPassport = await checkClient.readContract({
            address: PASSPORT_NFT,
            abi: parseAbi(['function hasPassport(address user, string countryCode) view returns (bool)']),
            functionName: 'hasPassport',
            args: [userAddress as Address, countryCode],
          });

          if (hasExistingPassport) {
            const countryName = params?.countryName || 'this country';
            return NextResponse.json({
              success: false,
              error: `You already own a passport for ${countryName}. Each wallet can only mint one passport per country.`,
            }, { status: 400 });
          }
          console.log('✅ Pre-check passed: No existing passport for', countryCode);
        } catch (preCheckErr: any) {
          console.warn('⚠️ Pre-check failed (continuing anyway):', preCheckErr.message);
          // Continue with mint attempt - contract will reject if duplicate
        }

        // PassportNFT requires 150 WMON via safeTransferFrom
        const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
        const PASSPORT_MINT_PRICE = parseEther('150');

        const mintCalls: Array<{ to: Address; value: bigint; data: Hex }> = [];

        // Check existing WMON balance and allowance
        let hasAllowance = false;
        let hasWmonBalance = false;
        const mintSafeAddr = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : SAFE_ACCOUNT;

        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const checkClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          // Check WMON balance
          const wmonBal = await checkClient.readContract({
            address: WMON_ADDRESS,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [mintSafeAddr],
          }) as bigint;

          hasWmonBalance = wmonBal >= PASSPORT_MINT_PRICE;
          console.log('💰 Safe WMON balance:', wmonBal.toString(), hasWmonBalance ? '(sufficient)' : '(need wrap)');

          // If not enough WMON, auto-wrap MON to WMON first
          if (!hasWmonBalance) {
            const wmonNeeded = PASSPORT_MINT_PRICE - wmonBal;
            const wmonNeededStr = (Number(wmonNeeded) / 1e18).toFixed(2);
            console.log('🔄 AUTO-WRAP: Need to wrap', wmonNeededStr, 'MON to WMON before mint');

            // Check if Safe has enough MON to wrap
            const monBal = await checkClient.getBalance({ address: mintSafeAddr });
            if (monBal < wmonNeeded) {
              return NextResponse.json({
                success: false,
                error: `Insufficient MON. Need ${wmonNeededStr} MON to wrap but only have ${(Number(monBal) / 1e18).toFixed(2)} MON.`,
              }, { status: 400 });
            }

            // Execute wrap as separate UserOp
            console.log('💱 Wrapping MON to WMON...');
            const wrapCalls = [{
              to: WMON_ADDRESS,
              value: wmonNeeded,
              data: encodeFunctionData({
                abi: parseAbi(['function deposit() external payable']),
                functionName: 'deposit',
              }) as Hex,
            }];

            const wrapTxHash = await executeTransaction(wrapCalls, userAddress as Address);
            console.log('✅ Wrap successful, TX:', wrapTxHash);

            // Wait for state to propagate
            await new Promise(r => setTimeout(r, 2000));
            hasWmonBalance = true;
          }

          // Check allowance
          const currentAllowance = await checkClient.readContract({
            address: WMON_ADDRESS,
            abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
            functionName: 'allowance',
            args: [mintSafeAddr, PASSPORT_NFT],
          }) as bigint;

          hasAllowance = currentAllowance >= PASSPORT_MINT_PRICE;
          console.log('💳 WMON allowance for passport:', currentAllowance.toString(), hasAllowance ? '(sufficient)' : '(need approval)');
        } catch (checkErr: any) {
          console.warn('⚠️ Could not check WMON state:', checkErr.message);
        }

        // CRITICAL: Do approve as SEPARATE UserOp to avoid bundler gas estimation issues
        if (!hasAllowance) {
          console.log('🔓 Step 1: Approving WMON for passport (separate UserOp)...');
          const wmonApproveCalls = [{
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              // SECURITY: Approve only the exact mint price + 10% buffer (not unlimited)
              args: [PASSPORT_NFT, PASSPORT_MINT_PRICE + (PASSPORT_MINT_PRICE / 10n)],
            }) as Hex,
          }];

          const approveTxHash = await executeTransaction(wmonApproveCalls, userAddress as Address);
          console.log('✅ Approve successful, TX:', approveTxHash);

          // Wait a moment for state to propagate
          await new Promise(r => setTimeout(r, 2000));
        }

        // Step 2: Call mintFor (now as single call, not batched with approve)
        mintCalls.push({
          to: PASSPORT_NFT,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi([
              'function mintFor(address beneficiary, uint256 userFid, string countryCode, string countryName, string region, string continent, string uri) external returns (uint256)'
            ]),
            functionName: 'mintFor',
            args: [
              userAddress as Address,
              BigInt(params?.fid || 0),
              params?.countryCode || 'US',
              params?.countryName || 'United States',
              params?.region || 'Americas',
              params?.continent || 'North America',
              params?.uri || '',
            ],
          }) as Hex,
        });

        console.log('💳 Step 2: Executing mint transaction...');
        const mintTxHash = await executeTransaction(mintCalls, userAddress as Address);
        console.log('✅ Mint successful, TX:', mintTxHash);

        // Parse tokenId from mint receipt Transfer event (ALWAYS, not just for casts)
        let mintedTokenId = 0;
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const receiptClient = createPublicClient({
            chain: activeChain,
            transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
          });
          const receipt = await receiptClient.getTransactionReceipt({ hash: mintTxHash as `0x${string}` });
          // ERC-721 Transfer event: Transfer(address,address,uint256) - tokenId is topic[3]
          const transferLog = receipt.logs.find(
            (log) => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
              && log.address.toLowerCase() === PASSPORT_NFT.toLowerCase()
          );
          if (transferLog && transferLog.topics[3]) {
            mintedTokenId = Number(BigInt(transferLog.topics[3]));
            console.log('🎫 Minted passport tokenId:', mintedTokenId);
          }
        } catch (receiptErr) {
          console.warn('⚠️ Could not parse tokenId from receipt:', receiptErr);
        }

        // ✅ POST CAST WITH MINI-APP FRAME EMBED (opens in Farcaster mini-app, not browser)
        if (params?.fid) {
          try {
            // Use frame endpoint which has proper fc:frame meta with launch_frame action
            const frameUrl = `${APP_URL}/api/frames/passport/${mintedTokenId}`;
            const castText = `🎫 New Travel Passport NFT Minted!

${params.countryCode || 'US'} ${params.countryName || 'United States'}

⚡ Gasless minting powered by @empowertours
🌍 Collect all 195 countries

@empowertours`;

            console.log('📢 Posting passport cast with frame embed...');
            console.log('🎬 Frame URL:', frameUrl);

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: frameUrl }]
            });

            console.log('✅ Passport cast posted with frame embed:', {
              hash: castResult.cast?.hash,
              countryCode: params.countryCode,
              frameUrl,
              mintedTokenId
            });
          } catch (castError: any) {
            console.error('❌ Passport cast posting failed:', {
              message: castError.message,
              status: castError.response?.status,
              statusText: castError.response?.statusText,
              errorData: castError.response?.data,
            });
            // Don't fail the transaction if cast fails
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintTxHash,
          tokenId: mintedTokenId,
          action,
          userAddress,
          message: `Passport minted successfully`,
        });

      // ==================== MINT MUSIC (WITH CAST + FRAME) ====================
      case 'mint_music':
        // ✅ Determine if it's Art or Music NFT
        const isArtNFT = params.is_art === true || params.is_art === 1 || params.is_art === '1';
        const nftTypeValue = isArtNFT ? 1 : 0; // 0 = MUSIC, 1 = ART
        const nftTypeName = isArtNFT ? 'Art' : 'Music';

        console.log(`${isArtNFT ? '🎨' : '🎵'} Action: mint_${isArtNFT ? 'art' : 'music'} (nftType: ${nftTypeValue})`);
        if (!params?.tokenURI || !params?.price) {
          return NextResponse.json(
            { success: false, error: `Missing tokenURI or price for ${nftTypeName.toLowerCase()} mint` },
            { status: 400 }
          );
        }

        // ✅ CHECK IF SONG/ART ALREADY EXISTS
        const songTitle = params.songTitle || params.title || 'Untitled';
        console.log('🔍 Checking if NFT already exists:', { artist: userAddress, title: songTitle, isArt: isArtNFT });

        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const checkClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const songExists = await checkClient.readContract({
            address: EMPOWER_TOURS_NFT as Address,
            abi: parseAbi(['function hasSong(address artist, string songTitle) external view returns (bool)']),
            functionName: 'hasSong',
            args: [userAddress as Address, songTitle],
          });

          if (songExists) {
            console.log(`❌ ${nftTypeName} NFT already minted:`, songTitle);
            return NextResponse.json(
              {
                success: false,
                error: `"${songTitle}" has already been minted by this artist. Please use a different title.`
              },
              { status: 400 }
            );
          }
          console.log('✅ NFT title available');
        } catch (checkError: any) {
          console.warn('⚠️ Could not verify NFT existence, proceeding with mint:', checkError.message);
          // Continue with mint if check fails (backwards compatible)
        }

        const musicPrice = parseEther(params.price.toString());
        console.log(`${isArtNFT ? '🎨' : '🎵'} Minting ${nftTypeName} NFT:`, {
          artist: userAddress,
          price: params.price,
          tokenURI: params.tokenURI,
          title: songTitle,
          nftType: `${nftTypeValue} (${nftTypeName})`,
          imageUrl: params.imageUrl ? 'provided' : 'none'
        });

        // Get artistFid from params - required by contract
        const artistFid = params.fid ? BigInt(params.fid) : 0n;

        const musicCalls = [
          {
            to: EMPOWER_TOURS_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mintMaster(address artist, uint256 artistFid, string tokenURI, string title, uint256 price, uint8 nftType) external returns (uint256)'
              ]),
              functionName: 'mintMaster',
              args: [
                userAddress as Address,
                artistFid,               // ✅ artistFid - Farcaster ID
                params.tokenURI,
                songTitle,
                musicPrice,
                nftTypeValue, // ✅ 0 = MUSIC, 1 = ART
              ],
            }) as Hex,
          },
        ];

        console.log(`💳 Executing ${nftTypeName} NFT mint transaction...`);
        const musicTxHash = await executeTransaction(musicCalls, userAddress as Address);
        console.log(`✅ ${nftTypeName} NFT mint successful, TX:`, musicTxHash);

        // ✅ EXTRACT TOKEN ID FROM TX RECEIPT
        let extractedTokenId = '0';
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const receipt = await client.getTransactionReceipt({
            hash: musicTxHash as Hex,
          });

          if (receipt?.logs && receipt.logs.length > 0) {
            // Look for Transfer event (ERC721 mint)
            const transferLog = receipt.logs.find(
              log => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            );
            if (transferLog && transferLog.topics[3]) {
              extractedTokenId = BigInt(transferLog.topics[3]).toString();
              console.log('🎫 Extracted token ID from receipt:', extractedTokenId);
            }
          }
        } catch (extractError: any) {
          console.warn('⚠️ Could not extract token ID, using indexer fallback:', extractError.message);
        }

        // ✅ POST CAST WITH FRAME - Link to artist profile
        let frameUrl = '';
        let ogImageUrl = '';
        if (params?.fid) {
          try {
            // ✅ Determine if it's music or art (0 = MUSIC, 1 = ART)
            const isArt = params.is_art === true || params.is_art === 1 || params.is_art === '1';

            // ✅ OG image route based on NFT type with direct image URL
            const ogRoute = isArt ? 'art' : 'music';

            // Try to create short URL if params provided (to avoid 256 byte limit)
            if (params.imageUrl) {
              const fullOgUrl = `${APP_URL}/api/og/${ogRoute}?tokenId=${extractedTokenId}&imageUrl=${encodeURIComponent(params.imageUrl)}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(userAddress)}&price=${encodeURIComponent(params.price)}`;

              console.log(`🔗 Full OG URL length: ${fullOgUrl.length} bytes`);

              // If URL > 256 bytes, use URL shortener
              if (fullOgUrl.length > 256) {
                console.log('⚠️ OG URL exceeds 256 bytes, creating short URL...');
                const shortId = await createShortUrl(fullOgUrl);

                if (shortId) {
                  ogImageUrl = `${APP_URL}/api/s/${shortId}`;
                  console.log(`✅ Short URL created: ${ogImageUrl} (${ogImageUrl.length} bytes)`);
                } else {
                  // Fallback: use simple URL without params (relies on Envio indexer)
                  console.log('⚠️ Short URL creation failed, using fallback (no params)');
                  ogImageUrl = `${APP_URL}/api/og/${ogRoute}?tokenId=${extractedTokenId}`;
                }
              } else {
                // URL is short enough, use it directly
                ogImageUrl = fullOgUrl;
              }
            } else {
              // No imageUrl provided, use simple URL
              ogImageUrl = `${APP_URL}/api/og/${ogRoute}?tokenId=${extractedTokenId}`;
            }

            // ✅ Link to artist profile within mini app
            const artistProfileUrl = `${APP_URL}/artist/${userAddress}`;
            frameUrl = artistProfileUrl;

            // ✅ Conditional cast message based on NFT type
            const nftTypeEmoji = isArt ? '🎨' : '🎵';
            const nftTypeText = isArt ? 'Art NFT' : 'Music NFT';
            const actionText = isArt ? 'View Gallery' : 'Listen & Buy';

            // ✅ Single frame URL with proper OG tags + audio preview + autoplay
            const frameRoute = isArt ? 'art' : 'music';
            let frameUrlWithParams = `${APP_URL}/api/frames/${frameRoute}/${extractedTokenId}?imageUrl=${encodeURIComponent(params.imageUrl || '')}&title=${encodeURIComponent(params.songTitle || params.title || 'Untitled')}&price=${params.price}&artist=${userAddress}&autoplay=true`;

            // ✅ Shorten frame URL if > 256 bytes (Farcaster limit)
            if (frameUrlWithParams.length > 256) {
              console.log(`⚠️ Frame URL exceeds 256 bytes (${frameUrlWithParams.length}), creating short URL...`);
              const shortFrameId = await createShortUrl(frameUrlWithParams);
              if (shortFrameId) {
                frameUrlWithParams = `${APP_URL}/api/s/${shortFrameId}`;
                console.log(`✅ Short frame URL created: ${frameUrlWithParams} (${frameUrlWithParams.length} bytes)`);
              } else {
                // Fallback: use simple URL without params
                frameUrlWithParams = `${APP_URL}/api/frames/${frameRoute}/${extractedTokenId}`;
                console.log(`⚠️ Fallback to simple frame URL: ${frameUrlWithParams}`);
              }
            }

            // Short artist address for display
            const shortArtist = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

            const castText = `${nftTypeEmoji} New ${nftTypeText} Minted!

"${params.songTitle || params.title || 'Untitled'}"
💰 License: ${params.price} WMON
👤 Artist: ${shortArtist}

⚡ Gasless minting by @empowertours
👀 Tap the image to ${actionText}!`;

            console.log('📢 Posting NFT cast with frame embed...');
            console.log('🎬 Frame URL:', frameUrlWithParams);
            console.log('🎬 NFT Type:', isArt ? 'Art' : 'Music');

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            console.log('📤 Calling Neynar publishCast...');
            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [
                { url: frameUrlWithParams }  // Single frame embed with cover art + audio
              ]
            });

            console.log(`✅ ${nftTypeName} NFT cast posted:`, {
              hash: castResult.cast?.hash,
              title: songTitle,
              tokenId: extractedTokenId,
              ogImageUrl,
              frameUrl
            });
          } catch (castError: any) {
            console.error(`❌ ${nftTypeName} NFT cast posting FAILED:`, {
              errorMessage: castError.message,
              httpStatus: castError.response?.status,
              statusText: castError.response?.statusText,
              responseData: castError.response?.data,
              responseText: castError.response?.text,
              tokenId: extractedTokenId,
              title: songTitle,
              isArt: isArtNFT,
              ogImageUrl,
              frameUrl,
            });
            // Don't fail the transaction if cast fails
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: musicTxHash,
          tokenId: extractedTokenId,
          action,
          userAddress,
          songTitle: songTitle,
          title: songTitle,
          isArt: isArtNFT,
          nftType: nftTypeValue,
          price: params.price,
          message: `${nftTypeName} NFT minted successfully: "${songTitle}" at ${params.price} WMON (Token #${extractedTokenId})`,
        });

      // ==================== MINT COLLECTOR EDITION ====================
      case 'mint_collector': {
        const isCollectorArt = params.is_art === true || params.is_art === 1 || params.is_art === '1';
        const collectorNftType = isCollectorArt ? 1 : 0; // 0 = MUSIC, 1 = ART
        const collectorTypeName = isCollectorArt ? 'Art' : 'Music';

        console.log(`👑 Action: mint_collector (${collectorTypeName}, nftType: ${collectorNftType})`);
        if (!params?.tokenURI || !params?.price || !params?.collectorPrice || !params?.maxEditions) {
          return NextResponse.json(
            { success: false, error: 'Missing required params for collector mint (tokenURI, price, collectorPrice, maxEditions)' },
            { status: 400 }
          );
        }

        const collectorSongTitle = params.songTitle || params.title || 'Untitled';
        const collectorTokenURI = params.collectorTokenURI || params.tokenURI;

        // Validate collector price and editions
        const cPrice = parseFloat(params.collectorPrice);
        const cEditions = parseInt(params.maxEditions);
        if (isNaN(cPrice) || cPrice < 500 || cPrice > 100_000_000) {
          return NextResponse.json(
            { success: false, error: 'Collector price must be between 500 and 100,000,000 WMON' },
            { status: 400 }
          );
        }
        if (isNaN(cEditions) || cEditions < 1 || cEditions > 1000) {
          return NextResponse.json(
            { success: false, error: 'Max editions must be between 1 and 1,000' },
            { status: 400 }
          );
        }

        // Check if already exists
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const checkCollectorClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const collectorExists = await checkCollectorClient.readContract({
            address: EMPOWER_TOURS_NFT as Address,
            abi: parseAbi(['function hasSong(address artist, string songTitle) external view returns (bool)']),
            functionName: 'hasSong',
            args: [userAddress as Address, collectorSongTitle],
          });

          if (collectorExists) {
            console.log(`❌ Collector NFT already minted: ${collectorSongTitle}`);
            return NextResponse.json(
              { success: false, error: `"${collectorSongTitle}" has already been minted by this artist.` },
              { status: 400 }
            );
          }
        } catch (checkErr: any) {
          console.warn('⚠️ Could not verify collector NFT existence, proceeding:', checkErr.message);
        }

        const collectorStandardPrice = parseEther(params.price.toString());
        const collectorEditionPrice = parseEther(params.collectorPrice.toString());
        const collectorArtistFid = params.fid ? BigInt(params.fid) : 0n;

        // AI art generation fee: 5 WMON for music collectors only (covers Gemini costs)
        // Art collector editions have no fee — the artist's original art is used as-is
        const COLLECTOR_CREATION_FEE = parseEther('5');
        const hasCreationFee = !isCollectorArt; // Only music collectors pay the AI fee
        const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;

        console.log('👑 Minting Collector Edition NFT:', {
          artist: userAddress,
          standardPrice: params.price,
          collectorPrice: params.collectorPrice,
          maxEditions: cEditions,
          tokenURI: params.tokenURI,
          collectorTokenURI,
          title: collectorSongTitle,
          nftType: `${collectorNftType} (${collectorTypeName})`,
          creationFee: hasCreationFee ? '5 WMON' : 'None (art)',
        });

        const collectorCalls: Call[] = [];

        // Only add WMON wrap+transfer fee for music collectors
        if (hasCreationFee) {
          collectorCalls.push(
            // Step 1: Wrap 5 MON to WMON for creation fee
            {
              to: WMON_ADDRESS,
              value: COLLECTOR_CREATION_FEE,
              data: encodeFunctionData({
                abi: parseAbi(['function deposit() external payable']),
                functionName: 'deposit',
                args: [],
              }) as Hex,
            },
            // Step 2: Transfer 5 WMON creation fee to platform Safe
            {
              to: WMON_ADDRESS,
              value: 0n,
              data: encodeFunctionData({
                abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
                functionName: 'transfer',
                args: [SAFE_ACCOUNT, COLLECTOR_CREATION_FEE],
              }) as Hex,
            },
          );
        }

        // Mint the collector edition NFT
        collectorCalls.push({
          to: EMPOWER_TOURS_NFT,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi([
              'function mintCollectorMaster(address artist, uint256 artistFid, string tokenURI, string collectorTokenURI, string title, uint256 standardPrice, uint256 collectorPrice, uint256 maxEditions, uint8 nftType) external returns (uint256)'
            ]),
            functionName: 'mintCollectorMaster',
            args: [
              userAddress as Address,
              collectorArtistFid,
              params.tokenURI,
              collectorTokenURI,
              collectorSongTitle,
              collectorStandardPrice,
              collectorEditionPrice,
              BigInt(cEditions),
              collectorNftType,
            ],
          }) as Hex,
        });

        const requiredValue = hasCreationFee ? COLLECTOR_CREATION_FEE : 0n;
        console.log(`💳 Executing collector NFT mint transaction${hasCreationFee ? ' (with 5 WMON creation fee)' : ' (no fee)'}...`);
        const collectorTxHash = await executeTransaction(collectorCalls, userAddress as Address, requiredValue);
        console.log('✅ Collector NFT mint successful, TX:', collectorTxHash);

        // Extract token ID from receipt
        let collectorTokenId = '0';
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const receiptClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const collectorReceipt = await receiptClient.getTransactionReceipt({
            hash: collectorTxHash as Hex,
          });

          if (collectorReceipt?.logs && collectorReceipt.logs.length > 0) {
            const transferLog = collectorReceipt.logs.find(
              log => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            );
            if (transferLog && transferLog.topics[3]) {
              collectorTokenId = BigInt(transferLog.topics[3]).toString();
              console.log('🎫 Extracted collector token ID:', collectorTokenId);
            }
          }
        } catch (extractErr: any) {
          console.warn('⚠️ Could not extract collector token ID:', extractErr.message);
        }

        // Post Farcaster cast with collector edition details
        if (params?.fid) {
          try {
            const isArt = isCollectorArt;
            const shortArtist = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
            const nftEmoji = isArt ? '🎨' : '🎵';
            const nftText = isArt ? 'Art' : 'Music';

            const collectorCastText = `👑 New Collector Edition ${nftText} NFT!

"${collectorSongTitle}"
💰 Standard: ${params.price} WMON
👑 Collector: ${params.collectorPrice} WMON (${cEditions} editions)
👤 Artist: ${shortArtist}

⚡ Gasless minting by @empowertours`;

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const neynarClient = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const frameRoute = isArt ? 'art' : 'music';
            let collectorFrameUrl = `${APP_URL}/api/frames/${frameRoute}/${collectorTokenId}?imageUrl=${encodeURIComponent(params.imageUrl || '')}&title=${encodeURIComponent(collectorSongTitle)}&price=${params.price}&artist=${userAddress}&collector=true`;

            if (collectorFrameUrl.length > 256) {
              const shortId = await createShortUrl(collectorFrameUrl);
              if (shortId) {
                collectorFrameUrl = `${APP_URL}/api/s/${shortId}`;
              } else {
                collectorFrameUrl = `${APP_URL}/api/frames/${frameRoute}/${collectorTokenId}`;
              }
            }

            await neynarClient.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: collectorCastText,
              embeds: [{ url: collectorFrameUrl }],
            });

            console.log('✅ Collector NFT cast posted');
          } catch (castErr: any) {
            console.error('❌ Collector NFT cast failed:', castErr.message);
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: collectorTxHash,
          tokenId: collectorTokenId,
          action,
          userAddress,
          songTitle: collectorSongTitle,
          title: collectorSongTitle,
          isArt: isCollectorArt,
          nftType: collectorNftType,
          price: params.price,
          collectorPrice: params.collectorPrice,
          maxEditions: cEditions,
          message: `Collector Edition ${collectorTypeName} NFT minted: "${collectorSongTitle}" - Standard: ${params.price} WMON, Collector: ${params.collectorPrice} WMON (${cEditions} editions) (Token #${collectorTokenId})`,
        });
      }

      // ==================== BUY MUSIC (WITH CAST + FRAME) - FIXED ====================
      case 'buy_music':
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for buy_music' },
            { status: 400 }
          );
        }

        const tokenId = BigInt(params.tokenId);

        // ✅ Check if it's an art NFT first for proper logging + self-purchase prevention
        let isPurchaseArtNFT = false;
        let nftArtistAddress: string | null = null;
        try {
          const typeCheckQuery = `
            query CheckPurchaseNFTType($tokenId: String!) {
              MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                tokenId
                isArt
                artist
              }
            }
          `;

          const typeCheckRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: typeCheckQuery,
              variables: { tokenId: tokenId.toString() }
            })
          });

          if (typeCheckRes.ok) {
            const typeCheckData = await typeCheckRes.json();
            const nft = typeCheckData.data?.MusicNFT?.[0];
            if (nft) {
              isPurchaseArtNFT = nft.isArt === true;
              nftArtistAddress = nft.artist?.toLowerCase() || null;
            }
          }
        } catch (err) {
          console.warn('Could not check purchase NFT type, assuming music');
        }

        // ✅ Prevent self-purchase - users cannot buy their own NFTs
        if (nftArtistAddress && userAddress && nftArtistAddress === userAddress.toLowerCase()) {
          console.log('🚫 Self-purchase blocked: User is the artist/owner of this NFT');
          return NextResponse.json(
            { success: false, error: 'You cannot purchase your own NFT' },
            { status: 400 }
          );
        }

        const purchaseNFTType = isPurchaseArtNFT ? 'Art NFT' : 'Music License';
        const purchaseEmoji = isPurchaseArtNFT ? '🎨' : '🎵';
        console.log(`${purchaseEmoji} Action: buy_${isPurchaseArtNFT ? 'art' : 'music'} (batched approve + purchaseLicenseFor)`);
        console.log(`${purchaseEmoji} Token:`, tokenId.toString());
        console.log(`👤 Buyer:`, userAddress);
        console.log(`📦 Type:`, purchaseNFTType);

        // ✅ Check Safe has enough TOURS before purchase
        try {
          // First, get the NFT price from Envio
          const priceQuery = `
            query GetNFTPrice($tokenId: String!) {
              MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                tokenId
                price
              }
            }
          `;

          const priceRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: priceQuery,
              variables: { tokenId: tokenId.toString() }
            })
          });

          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const nft = priceData.data?.MusicNFT?.[0];

            if (nft?.price) {
              const nftPrice = BigInt(nft.price);
              console.log('💰 NFT Price from Envio:', nftPrice.toString(), 'wei');

              // Now check Safe's WMON balance (using WMON for payments, not TOURS)
              const { createPublicClient, http } = await import('viem');
              const { activeChain } = await import('@/app/chains');
              const client = createPublicClient({
                chain: activeChain,
                transport: http(),
              });

              // Use correct Safe address based on mode
              const safeToCheck = USE_USER_SAFES
                ? await getUserSafeAddress(userAddress as Address)
                : SAFE_ACCOUNT;

              console.log('🏠 Checking Safe for NFT purchase:', safeToCheck, 'derived from EOA:', userAddress);

              const WMON_FOR_BUY = process.env.NEXT_PUBLIC_WMON as Address;
              const safeWmonBalance = await client.readContract({
                address: WMON_FOR_BUY,
                abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
                functionName: 'balanceOf',
                args: [safeToCheck],
              }) as bigint;

              // Also check MON balance for potential auto-wrap
              const safeMonBalance = await client.getBalance({ address: safeToCheck });
              console.log('💰 Safe balances - WMON:', (Number(safeWmonBalance) / 1e18).toFixed(4), 'MON:', (Number(safeMonBalance) / 1e18).toFixed(4));
              console.log('   Safe address:', safeToCheck, USE_USER_SAFES ? '(User Safe)' : '(Platform Safe)');
              console.log('   Required for NFT purchase:', (Number(nftPrice) / 1e18).toFixed(4), 'WMON');

              if (safeWmonBalance < nftPrice) {
                // Check if user has enough MON to wrap
                const wmonNeeded = nftPrice - safeWmonBalance;
                const gasBuffer = parseEther('0.1'); // Keep some MON for gas

                if (safeMonBalance >= wmonNeeded + gasBuffer) {
                  console.log('🔄 Auto-wrapping MON to WMON for NFT purchase...');
                  console.log('   Need to wrap:', (Number(wmonNeeded) / 1e18).toFixed(4), 'MON');

                  // Auto-wrap MON to WMON
                  const wrapCalls = [{
                    to: WMON_FOR_BUY,
                    value: wmonNeeded,
                    data: encodeFunctionData({
                      abi: parseAbi(['function deposit() public payable']),
                      functionName: 'deposit',
                    }) as Hex,
                  }];

                  try {
                    const wrapTxHash = await executeTransaction(wrapCalls, userAddress as Address);
                    console.log('✅ MON wrapped to WMON:', wrapTxHash);
                  } catch (wrapErr: any) {
                    console.error('❌ Auto-wrap failed:', wrapErr.message);
                    return NextResponse.json(
                      {
                        success: false,
                        error: `Failed to auto-wrap MON to WMON: ${wrapErr.message}`
                      },
                      { status: 500 }
                    );
                  }
                } else {
                  const currentWMON = (Number(safeWmonBalance) / 1e18).toFixed(4);
                  const currentMON = (Number(safeMonBalance) / 1e18).toFixed(4);
                  const requiredWMON = (Number(nftPrice) / 1e18).toFixed(4);
                  const shortfall = (Number(nftPrice - safeWmonBalance - safeMonBalance + gasBuffer) / 1e18).toFixed(4);

                  return NextResponse.json(
                    {
                      success: false,
                      error: `Insufficient funds in Safe. Safe has ${currentWMON} WMON and ${currentMON} MON, but this ${purchaseNFTType} costs ${requiredWMON} WMON plus gas. ${USE_USER_SAFES ? `Please fund your Safe at ${safeToCheck} with more MON or WMON.` : 'Please contact support.'}`
                    },
                    { status: 400 }
                  );
                }
              }

              console.log('✅ Sufficient WMON balance confirmed (or wrapped)');
            }
          }
        } catch (balanceErr: any) {
          console.warn('⚠️ Could not verify Safe WMON balance:', balanceErr.message);
          // Continue with purchase - balance check is a nice-to-have, not critical
        }

        // Use WMON for NFT purchases (not TOURS)
        const WMON_FOR_PURCHASE = process.env.NEXT_PUBLIC_WMON as Address;
        // Get user's FID for the license purchase (contract requires it)
        const buyerFid = params?.fid || fid || 0;
        console.log('🎫 Purchasing license with FID:', buyerFid);

        const buyCalls = [
          {
            to: WMON_FOR_PURCHASE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              // SECURITY: Approve reasonable max (100 WMON) instead of unlimited
              // Balance check already validated user can afford the NFT
              args: [EMPOWER_TOURS_NFT, parseEther('100')],
            }) as Hex,
          },
          {
            to: EMPOWER_TOURS_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function purchaseLicenseFor(uint256 masterTokenId, address licensee, uint256 licenseeFid) external'
              ]),
              functionName: 'purchaseLicenseFor',
              args: [tokenId, userAddress as Address, BigInt(buyerFid)],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched music purchase transaction...');
        const buyTxHash = await executeTransaction(buyCalls, userAddress as Address);
        console.log('✅ Music purchase successful, TX:', buyTxHash);

        // ✅ POST CAST WITH FRAME - FETCH MUSIC DATA FROM ENVIO (IMPROVED)
        if (params?.fid) {
          try {
            let songTitle = params.songTitle || 'Track';
            let songPrice = '0';  // ✅ Default to 0 not ?
            let songArtist = 'Unknown Artist';  // ✅ Better default
            let isArtNFT = false;  // ✅ Track if this is an Art NFT
            let buyerUsername = '';  // ✅ Track buyer's Farcaster username

            console.log('🔍 Fetching music metadata from Envio for token:', tokenId.toString());

            // ✅ Try to resolve buyer's Farcaster username first
            try {
              console.log('👤 Resolving buyer Farcaster username for:', userAddress);
              const buyerNeynarRes = await fetch(
                `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${userAddress}`,
                {
                  headers: {
                    'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
                  }
                }
              );

              if (buyerNeynarRes.ok) {
                const buyerNeynarData: any = await buyerNeynarRes.json();
                console.log('👤 Buyer Neynar response:', JSON.stringify(buyerNeynarData).substring(0, 300));

                // Handle bulk_by_address response format
                const buyerData = buyerNeynarData[userAddress.toLowerCase()];
                if (buyerData && buyerData.length > 0 && buyerData[0].username) {
                  buyerUsername = `@${buyerData[0].username}`;
                  console.log('✅ Resolved buyer username:', buyerUsername);
                } else {
                  // Fallback to shortened address
                  buyerUsername = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
                  console.log('⚠️ Could not resolve buyer username, using address');
                }
              } else {
                buyerUsername = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
                console.log('⚠️ Buyer Neynar API failed, using address');
              }
            } catch (buyerErr) {
              console.warn('⚠️ Buyer FID lookup failed:', buyerErr);
              buyerUsername = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
            }

            try {
              const query = `
                query GetMusicNFT($tokenId: String!) {
                  MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                    tokenId
                    name
                    price
                    artist
                    isArt
                  }
                }
              `;

              console.log('📤 Envio query variables:', { tokenId: tokenId.toString() });

              const envioRes = await fetch(ENVIO_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query,
                  variables: { tokenId: tokenId.toString() }
                })
              });

              console.log('📥 Envio response status:', envioRes.status);

              if (envioRes.ok) {
                const envioData = await envioRes.json();
                console.log('📥 Envio data:', JSON.stringify(envioData).substring(0, 200));

                const musicNFT = envioData.data?.MusicNFT?.[0];
                console.log('🎵 Found MusicNFT:', musicNFT);

                if (musicNFT) {
                  songTitle = musicNFT.name || 'Track';
                  isArtNFT = musicNFT.isArt === true;  // ✅ Check if it's an Art NFT

                  // ✅ Convert price from wei (inline to ensure it works)
                  if (musicNFT.price) {
                    try {
                      const priceBI = BigInt(musicNFT.price);
                      const priceNum = Number(priceBI) / 1e18;
                      songPrice = priceNum.toString();
                      console.log('💰 Converted price:', { raw: musicNFT.price, converted: songPrice });
                    } catch (priceErr) {
                      console.warn('⚠️ Price conversion failed:', priceErr);
                      songPrice = String(musicNFT.price);
                    }
                  }

                  // ✅ Get artist and try FID lookup with correct endpoint
                  if (musicNFT.artist) {
                    songArtist = musicNFT.artist;

                    // Try to resolve to FID if it's a wallet
                    if (musicNFT.artist.startsWith('0x')) {
                      try {
                        console.log('🔍 Resolving artist Farcaster username for:', musicNFT.artist);
                        const artistNeynarRes = await fetch(
                          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${musicNFT.artist}`,
                          {
                            headers: {
                              'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
                            }
                          }
                        );

                        if (artistNeynarRes.ok) {
                          const artistNeynarData: any = await artistNeynarRes.json();
                          console.log('🎤 Artist Neynar response:', JSON.stringify(artistNeynarData).substring(0, 300));

                          // Handle bulk_by_address response format
                          const artistData = artistNeynarData[musicNFT.artist.toLowerCase()];
                          if (artistData && artistData.length > 0 && artistData[0].username) {
                            songArtist = `@${artistData[0].username}`;
                            console.log('✅ Resolved artist username:', songArtist);
                          } else {
                            // Keep the wallet address if resolution fails
                            console.log('⚠️ Could not resolve artist username, keeping address');
                          }
                        } else {
                          console.warn('⚠️ Artist Neynar API failed, status:', artistNeynarRes.status);
                        }
                      } catch (fidErr) {
                        console.warn('⚠️ Artist FID lookup failed:', fidErr);
                      }
                    }
                  }

                  console.log('✅ Music data resolved:', { songTitle, songPrice, songArtist, buyerUsername });
                } else {
                  console.warn('⚠️ MusicNFT array empty or not found');
                }
              } else {
                console.warn('⚠️ Envio not ok:', envioRes.status);
                const text = await envioRes.text();
                console.warn('⚠️ Response:', text.substring(0, 200));
              }
            } catch (envioErr: any) {
              console.error('❌ Envio fetch failed:', envioErr.message);
              console.error('❌ Stack:', envioErr.stack);
            }

            // ✅ Conditional frame URL and cast text based on NFT type
            const frameRoute = isArtNFT ? 'art' : 'music';
            const frameUrl = `${APP_URL}/api/frames/${frameRoute}/${tokenId.toString()}`;

            const nftEmoji = isArtNFT ? '🎨' : '🎵';
            const nftType = isArtNFT ? 'Art NFT' : 'Music License';
            const enjoyText = isArtNFT ? '🖼️ Enjoy your NFT!' : '🎧 Enjoy streaming!';

            const castText = `${nftEmoji} ${nftType} Purchased!

"${songTitle}" #${tokenId}
🎤 ${songArtist}
🛍️ Buyer: ${buyerUsername}
💰 ${songPrice} TOURS

⚡ Gasless transaction powered by @empowertours
${enjoyText}

🔗 TX: https://monadscan.com/tx/${buyTxHash}

@empowertours`;

            console.log('📢 Posting purchase cast with frame...');
            console.log('🎬 Frame URL:', frameUrl);
            console.log('🎬 Cast text:', castText);

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: frameUrl }]
            });

            console.log('✅ Purchase cast posted with frame:', {
              hash: castResult.cast?.hash,
              tokenId: tokenId.toString(),
              songTitle,
              songPrice,
              songArtist,
              buyerUsername,
              frameUrl
            });
          } catch (castError: any) {
            console.error('❌ Purchase cast posting failed:', {
              message: castError.message,
              status: castError.response?.status,
              statusText: castError.response?.statusText,
              errorData: castError.response?.data,
            });
            // Don't fail the transaction if cast fails
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: buyTxHash,
          action,
          userAddress,
          tokenId: tokenId.toString(),
          message: `NFT purchased for ${userAddress}`,
        });

      // ==================== SEND TOURS ====================
      case 'send_tours':
        console.log('💸 Action: send_tours');
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount for send_tours' },
            { status: 400 }
          );
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
          return NextResponse.json(
            { success: false, error: 'Invalid recipient address' },
            { status: 400 }
          );
        }

        const sendAmount = parseEther(params.amount.toString());
        console.log('💸 Sending:', sendAmount.toString(), 'TOURS to', params.recipient);

        const sendCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [params.recipient as Address, sendAmount],
            }) as Hex,
          },
        ];

        console.log('💳 Executing TOURS transfer transaction...');
        const sendTxHash = await executeTransaction(sendCalls, userAddress as Address);
        console.log('✅ TOURS sent successfully, TX:', sendTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: sendTxHash,
          action,
          userAddress,
          recipient: params.recipient,
          amount: params.amount,
          message: `Sent ${params.amount} TOURS successfully`,
        });

      // ==================== SEND MON ====================
      case 'send_mon':
        console.log('💸 Action: send_mon');
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount for send_mon' },
            { status: 400 }
          );
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
          return NextResponse.json(
            { success: false, error: 'Invalid recipient address' },
            { status: 400 }
          );
        }

        const sendMonAmount = parseEther(params.amount.toString());
        console.log('💸 Sending:', sendMonAmount.toString(), 'MON to', params.recipient);

        // Check Safe has enough MON
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          // Use correct Safe address based on mode
          const safeToCheckMon = USE_USER_SAFES
            ? await getUserSafeAddress(userAddress as Address)
            : SAFE_ACCOUNT;

          const safeBalance = await client.getBalance({
            address: safeToCheckMon as Address,
          });

          console.log('💰 Safe MON balance:', safeBalance.toString(), USE_USER_SAFES ? '(User Safe)' : '(Platform Safe)');
          console.log('   Requested send amount:', sendMonAmount.toString());

          if (safeBalance < sendMonAmount) {
            const currentMON = (Number(safeBalance) / 1e18).toFixed(4);
            const requestedMON = (Number(sendMonAmount) / 1e18).toFixed(4);
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON balance. Safe has ${currentMON} MON, but you're trying to send ${requestedMON} MON.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check MON balance:', balanceErr);
          return NextResponse.json(
            { success: false, error: `Failed to verify MON balance: ${balanceErr.message}` },
            { status: 500 }
          );
        }

        // Native MON transfer (plain value transfer)
        const sendMonCalls = [
          {
            to: params.recipient as Address,
            value: sendMonAmount,
            data: '0x' as Hex, // Empty data for plain transfer
          },
        ];

        console.log('💳 Executing MON transfer transaction...');
        const sendMonTxHash = await executeTransaction(sendMonCalls, userAddress as Address);
        console.log('✅ MON sent successfully, TX:', sendMonTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: sendMonTxHash,
          action,
          userAddress,
          recipient: params.recipient,
          amount: params.amount,
          message: `Sent ${params.amount} MON successfully`,
        });

      // ==================== SWAP MON FOR TOURS ====================
      case 'swap_mon_for_tours':
        console.log('💱 Action: swap_mon_for_tours');
        const monAmount = params?.amount ? parseEther(params.amount) : parseEther('0.1');
        console.log('💱 Swapping:', monAmount.toString(), 'wei MON');

        // ✅ Check TOURS balance BEFORE swap
        let toursBalanceBefore = 0n;
        let toursBalanceAfter = 0n;
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const swapClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const swapSafeToCheck = USE_USER_SAFES
            ? await getUserSafeAddress(userAddress as Address)
            : SAFE_ACCOUNT;

          toursBalanceBefore = await swapClient.readContract({
            address: TOURS_TOKEN,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [swapSafeToCheck],
          }) as bigint;

          console.log('💰 TOURS balance BEFORE swap:', (Number(toursBalanceBefore) / 1e18).toFixed(6), 'TOURS', USE_USER_SAFES ? `(User Safe: ${swapSafeToCheck})` : '(Platform Safe)');
        } catch (err: any) {
          console.warn('⚠️ Could not check TOURS balance before swap:', err.message);
        }

        const swapCalls = [
          {
            to: TOKEN_SWAP,
            value: monAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function swap() external payable']),
              functionName: 'swap',
              args: [],
            }) as Hex,
          },
        ];

        console.log('💳 Executing swap transaction...');
        const swapTxHash = await executeTransaction(swapCalls, userAddress as Address);
        console.log('✅ Swap successful, TX:', swapTxHash);

        // ✅ Check TOURS balance AFTER swap
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const swapClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const swapSafeToCheck = USE_USER_SAFES
            ? await getUserSafeAddress(userAddress as Address)
            : SAFE_ACCOUNT;

          toursBalanceAfter = await swapClient.readContract({
            address: TOURS_TOKEN,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [swapSafeToCheck],
          }) as bigint;

          const toursReceived = toursBalanceAfter - toursBalanceBefore;
          console.log('💰 TOURS balance AFTER swap:', (Number(toursBalanceAfter) / 1e18).toFixed(6), 'TOURS', USE_USER_SAFES ? `(User Safe: ${swapSafeToCheck})` : '(Platform Safe)');
          console.log('✅ TOURS received from swap:', (Number(toursReceived) / 1e18).toFixed(6), 'TOURS');
        } catch (err: any) {
          console.warn('⚠️ Could not check TOURS balance after swap:', err.message);
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: swapTxHash,
          action,
          userAddress,
          monAmount: monAmount.toString(),
          toursBalanceBefore: toursBalanceBefore.toString(),
          toursBalanceAfter: toursBalanceAfter.toString(),
          toursReceived: (toursBalanceAfter - toursBalanceBefore).toString(),
          message: `Swapped ${params?.amount || '0.1'} MON for TOURS successfully`,
        });

      // ==================== WRAP MON TO WMON ====================
      case 'wrap_mon':
        console.log('🎁 Action: wrap_mon');
        if (!params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for wrap_mon' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS_WRAP = process.env.NEXT_PUBLIC_WMON as Address;
        const wrapMonAmount = parseEther(params.amount.toString());

        console.log('🎁 Wrapping MON to WMON:', {
          amount: params.amount,
          wmonAddress: WMON_ADDRESS_WRAP,
        });

        // ✅ Check Safe has enough MON before wrap
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          // Use correct Safe address based on mode
          const safeToCheckWrap = USE_USER_SAFES
            ? await getUserSafeAddress(userAddress as Address)
            : SAFE_ACCOUNT;

          const safeMonBalance = await client.getBalance({
            address: safeToCheckWrap as Address,
          });

          console.log('💰 Safe MON balance:', safeMonBalance.toString(), USE_USER_SAFES ? '(User Safe)' : '(Platform Safe)');
          console.log('   Requested wrap amount:', wrapMonAmount.toString());

          if (safeMonBalance < wrapMonAmount) {
            const currentMON = (Number(safeMonBalance) / 1e18).toFixed(4);
            const requestedMON = (Number(wrapMonAmount) / 1e18).toFixed(4);
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON in Safe. Safe has ${currentMON} MON, but you're trying to wrap ${requestedMON} MON. Your MON may be in your wallet, not the Safe.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.warn('⚠️ Could not verify Safe MON balance:', balanceErr.message);
        }

        const wrapMonCalls = [
          {
            to: WMON_ADDRESS_WRAP,
            value: wrapMonAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          },
        ];

        const wrapMonTxHash = await executeTransaction(wrapMonCalls, userAddress as Address);
        console.log('✅ MON wrapped to WMON, TX:', wrapMonTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: wrapMonTxHash,
          action,
          userAddress,
          amount: params.amount,
          message: `Wrapped ${params.amount} MON to WMON successfully (gasless)`,
        });

      // ==================== APPROVE WMON FOR PASSPORT ====================
      case 'approve_wmon_for_passport':
        console.log('🔓 Action: approve_wmon_for_passport');

        const WMON_APPROVE = process.env.NEXT_PUBLIC_WMON as Address;
        const PASSPORT_APPROVE = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
        // SECURITY: Approve only for a single mint (150 WMON + buffer), not unlimited
        const approveAmount = parseEther('165'); // Single passport price + 10% buffer

        const passportApproveCalls = [
          {
            to: WMON_APPROVE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [PASSPORT_APPROVE, approveAmount],
            }) as Hex,
          },
        ];

        const passportApproveTxHash = await executeTransaction(passportApproveCalls, userAddress as Address);
        console.log('✅ WMON approved for passport, TX:', passportApproveTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: passportApproveTxHash,
          action,
          userAddress,
          message: `Approved WMON for passport contract successfully`,
        });

      // ==================== WITHDRAW TO USER (Safe → User Wallet) ====================
      case 'withdraw_to_user':
        console.log('💸 Action: withdraw_to_user (Safe → User Wallet)');
        if (!params?.token || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing token or amount for withdraw_to_user' },
            { status: 400 }
          );
        }

        const withdrawAmount = parseEther(params.amount.toString());

        // Support common token shortcuts
        let withdrawTokenAddress: Address;
        const tokenParam = params.token.toLowerCase();

        if (tokenParam === 'tours') {
          withdrawTokenAddress = TOURS_TOKEN;
        } else if (tokenParam === 'wmon') {
          withdrawTokenAddress = process.env.NEXT_PUBLIC_WMON as Address;
        } else if (tokenParam === 'mon') {
          // Native MON transfer (no ERC-20, just send value)
          console.log('💸 Withdrawing native MON to user:', {
            amount: params.amount,
            recipient: userAddress,
          });

          const withdrawMonCalls = [
            {
              to: userAddress,
              value: withdrawAmount,
              data: '0x' as Hex, // Empty calldata for native transfer
            },
          ];

          const withdrawMonTxHash = await executeTransaction(withdrawMonCalls, userAddress as Address);
          console.log('✅ MON withdrawn to user, TX:', withdrawMonTxHash);

          await incrementTransactionCount(userAddress);
          return NextResponse.json({
            success: true,
            txHash: withdrawMonTxHash,
            action,
            userAddress,
            token: 'MON',
            amount: params.amount,
            message: `Withdrew ${params.amount} MON to your wallet successfully`,
          });
        } else if (tokenParam.startsWith('0x')) {
          // Direct address provided
          withdrawTokenAddress = tokenParam as Address;
        } else {
          return NextResponse.json(
            { success: false, error: `Unknown token: ${params.token}. Use 'tours', 'wmon', 'mon', or a token address.` },
            { status: 400 }
          );
        }

        console.log('💸 Withdrawing ERC-20 to user:', {
          token: withdrawTokenAddress,
          amount: params.amount,
          recipient: userAddress,
        });

        const withdrawTokenCalls = [
          {
            to: withdrawTokenAddress,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [userAddress, withdrawAmount],
            }) as Hex,
          },
        ];

        const withdrawTokenTxHash = await executeTransaction(withdrawTokenCalls, userAddress as Address);
        console.log('✅ Token withdrawn to user, TX:', withdrawTokenTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: withdrawTokenTxHash,
          action,
          userAddress,
          token: params.token,
          amount: params.amount,
          message: `Withdrew ${params.amount} ${params.token.toUpperCase()} to your wallet successfully`,
        });

      // ==================== MUSIC NFT V5: STAKING ====================
      case 'stake_music':
        console.log('🎵 Action: stake_music');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for stake_music' },
            { status: 400 }
          );
        }

        const stakeTokenId = BigInt(params.tokenId);

        const stakeMusicCalls = [
          {
            to: EMPOWER_TOURS_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function stakeMusicNFT(uint256 tokenId) external']),
              functionName: 'stakeMusicNFT',
              args: [stakeTokenId],
            }) as Hex,
          },
        ];

        const stakeMusicTxHash = await executeTransaction(stakeMusicCalls, userAddress as Address);
        console.log('✅ Music NFT staked, TX:', stakeMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: stakeMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} staked successfully`,
        });

      // ==================== MUSIC NFT V5: UNSTAKING ====================
      case 'unstake_music':
        console.log('🎵 Action: unstake_music');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for unstake_music' },
            { status: 400 }
          );
        }

        const unstakeTokenId = BigInt(params.tokenId);

        const unstakeMusicCalls = [
          {
            to: EMPOWER_TOURS_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unstakeMusicNFT(uint256 tokenId) external']),
              functionName: 'unstakeMusicNFT',
              args: [unstakeTokenId],
            }) as Hex,
          },
        ];

        const unstakeMusicTxHash = await executeTransaction(unstakeMusicCalls, userAddress as Address);
        console.log('✅ Music NFT unstaked, TX:', unstakeMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: unstakeMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} unstaked and rewards claimed`,
        });

      // ==================== MUSIC NFT V7: DELEGATED BURNING ====================
      case 'burn_music':
        console.log('🔥 Action: burn_music (v7 delegated)');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for burn_music' },
            { status: 400 }
          );
        }

        const burnTokenId = BigInt(params.tokenId);

        console.log('🔥 Burning NFT with delegated burner (Safe Account)');
        console.log('  - Owner:', userAddress);
        console.log('  - Token ID:', burnTokenId.toString());

        // v7 uses burnNFTForDelegated - Safe Account is authorized burner
        // NFT stays with user, Safe just has permission to burn it
        const burnMusicCalls = [
          {
            to: EMPOWER_TOURS_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function burnNFTForDelegated(address owner, uint256 tokenId) external']),
              functionName: 'burnNFTForDelegated',
              args: [userAddress as Address, burnTokenId],
            }) as Hex,
          },
        ];

        const burnMusicTxHash = await executeTransaction(burnMusicCalls, userAddress as Address);
        console.log('✅ Music NFT burned via delegated burner, TX:', burnMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: burnMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} burned for 5 TOURS reward`,
        });

      // ==================== CREATE SINGLE EXPERIENCE (Legacy - uses TOURS token) ====================
      case 'create_single_experience':
        console.log('🗺️ Action: create_single_experience');
        if (!params?.locationName || !params?.city || !params?.country || !params?.price || !params?.latitude || !params?.longitude) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters for create_single_experience' },
            { status: 400 }
          );
        }

        const SINGLE_EXPERIENCE_NFT = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const singleExperiencePrice = parseEther(params.price.toString());

        console.log('🗺️ Creating single experience:', {
          creator: userAddress,
          locationName: params.locationName,
          city: params.city,
          country: params.country,
          price: params.price,
          coords: { lat: params.latitude, lon: params.longitude }
        });

        // Build metadata object
        const metadata = {
          locationName: params.locationName,
          city: params.city,
          country: params.country,
          description: params.description || '',
          experienceType: params.experienceType || 'general',
          latitude: params.latitude.toString(),
          longitude: params.longitude.toString(),
          proximityRadius: params.proximityRadius || 100,
          imageHash: params.imageHash || '',
        };

        const singleExperienceCalls = [
          // Approve TOURS for the contract if needed
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [SINGLE_EXPERIENCE_NFT, singleExperiencePrice],
            }) as Hex,
          },
          {
            to: SINGLE_EXPERIENCE_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function createExperience(string locationName, string city, string country, string description, string experienceType, uint256 price, int256 latitude, int256 longitude, uint256 proximityRadius, string imageHash) external returns (uint256)'
              ]),
              functionName: 'createExperience',
              args: [
                params.locationName,
                params.city,
                params.country,
                params.description || '',
                params.experienceType || 'general',
                singleExperiencePrice,
                BigInt(Math.floor(params.latitude * 1e6)), // Store as integers with 6 decimal precision
                BigInt(Math.floor(params.longitude * 1e6)),
                BigInt(params.proximityRadius || 100),
                params.imageHash || '',
              ],
            }) as Hex,
          },
        ];

        const singleExperienceTxHash = await executeTransaction(singleExperienceCalls, userAddress as Address);
        console.log('✅ Single experience created, TX:', singleExperienceTxHash);

        // Extract experience ID from transaction receipt
        let singleExperienceId = '0';
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const receipt = await client.getTransactionReceipt({
            hash: singleExperienceTxHash as Hex,
          });

          if (receipt?.logs && receipt.logs.length > 0) {
            // Look for ExperienceCreated event
            const createdLog = receipt.logs.find(
              log => log.topics[0] === '0x' + '...' // Event signature hash
            );
            if (createdLog && createdLog.topics[1]) {
              singleExperienceId = BigInt(createdLog.topics[1]).toString();
              console.log('🎫 Extracted experience ID:', singleExperienceId);
            }
          }
        } catch (extractError: any) {
          console.warn('⚠️ Could not extract experience ID:', extractError.message);
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: singleExperienceTxHash,
          experienceId: singleExperienceId,
          action,
          userAddress,
          message: `Experience created successfully: ${params.locationName} in ${params.city}`,
        });

      // ==================== MINT ITINERARY (SIMPLIFIED) ====================
      case 'mint_itinerary':
        console.log('🗺️ Action: mint_itinerary');
        if (!params?.destination || !params?.country) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: destination and country' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_MINT = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;

        // Set sensible defaults
        const experienceType = 0; // ExperienceType.FOOD = 0
        const defaultPrice = parseEther('10'); // 10 TOURS default
        const defaultLat = 0; // Default coords (user can update later)
        const defaultLon = 0;
        const defaultRadius = 100; // 100 meters

        console.log('🗺️ Minting itinerary stamp:', {
          creator: userAddress,
          destination: params.destination,
          country: params.country,
          climbingGrade: params.climbingGrade || 'Not specified',
        });

        const mintItineraryCalls = [
          {
            to: ITINERARY_NFT_MINT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function createExperience(string country, string city, string locationName, string description, uint8 experienceType, int256 latitude, int256 longitude, uint256 proximityRadius, uint256 price, string ipfsImageHash) external returns (uint256)'
              ]),
              functionName: 'createExperience',
              args: [
                params.country,
                params.city || params.destination, // Use destination as city if not provided
                params.destination,
                params.description || `${params.destination} - ${params.climbingGrade || 'Travel experience'}`,
                experienceType,
                BigInt(defaultLat),
                BigInt(defaultLon),
                BigInt(defaultRadius),
                defaultPrice,
                params.photoUri || '',
              ],
            }) as Hex,
          },
        ];

        const mintItineraryTxHash = await executeTransaction(mintItineraryCalls, userAddress as Address);
        console.log('✅ Itinerary minted, TX:', mintItineraryTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintItineraryTxHash,
          action,
          userAddress,
          message: `Itinerary stamp minted successfully: ${params.destination}`,
        });

      // ==================== PURCHASE ITINERARY ====================
      case 'purchase_itinerary':
        console.log('🗺️ Action: purchase_itinerary');
        if (!params?.itineraryId) {
          return NextResponse.json(
            { success: false, error: 'Missing itineraryId for purchase_itinerary' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_PURCHASE = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const purchaseItineraryId = BigInt(params.itineraryId);

        console.log('🗺️ Purchasing itinerary:', {
          buyer: userAddress,
          itineraryId: purchaseItineraryId.toString()
        });

        // V2 uses WMON for payment via purchaseFor(address, uint256, uint256)
        const WMON_PURCHASE = process.env.NEXT_PUBLIC_WMON as Address;

        const purchaseItineraryCalls = [
          {
            to: WMON_PURCHASE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              // SECURITY: Approve a reasonable max (100 WMON) not unlimited
              args: [ITINERARY_NFT_PURCHASE, parseEther('100')],
            }) as Hex,
          },
          {
            to: ITINERARY_NFT_PURCHASE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function purchaseFor(address,uint256,uint256) external']),
              functionName: 'purchaseFor',
              args: [userAddress as Address, BigInt(fid || 0), purchaseItineraryId],
            }) as Hex,
          },
        ];

        const purchaseItineraryTxHash = await executeTransaction(purchaseItineraryCalls, userAddress as Address);
        console.log('✅ Itinerary purchased, TX:', purchaseItineraryTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: purchaseItineraryTxHash,
          action,
          userAddress,
          itineraryId: params.itineraryId,
          message: `Itinerary #${params.itineraryId} purchased successfully`,
        });

      // ==================== CHECK-IN TO ITINERARY (STAMP PASSPORT) ====================
      // Now auto-finds the correct passport based on experience country!
      case 'checkin_itinerary':
        console.log('📍 Action: checkin_itinerary');
        if (!params?.itineraryId || !params?.userLatitude || !params?.userLongitude) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: itineraryId, userLatitude, userLongitude' },
            { status: 400 }
          );
        }

        const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
        const ITINERARY_NFT_CHECKIN = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const checkinItineraryId = BigInt(params.itineraryId);

        console.log('📍 Checking in to itinerary:', {
          user: userAddress,
          itineraryId: checkinItineraryId.toString(),
          userCoords: { lat: params.userLatitude, lon: params.userLongitude }
        });

        // Verify GPS proximity (calculate on server for security)
        const { calculateDistance } = await import('@/lib/utils/gps');
        const { getCountryByName } = await import('@/lib/passport/countries');

        // Get itinerary details from Envio (including country for passport matching)
        let experienceCountry = '';
        let experienceCity = '';
        let experienceName = '';
        let gpsVerified = false;

        try {
          const query = `
            query GetItinerary($itineraryId: String!) {
              ExperienceNFT_ExperienceCreated(where: { tokenId: { _eq: $itineraryId } }, limit: 1) {
                tokenId
                name
                city
                country
                latitude
                longitude
                proximityRadius
              }
            }
          `;

          const envioRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              variables: { itineraryId: checkinItineraryId.toString() }
            })
          });

          if (envioRes.ok) {
            const envioData = await envioRes.json();
            const itinerary = envioData.data?.ExperienceNFT_ExperienceCreated?.[0];

            if (itinerary) {
              experienceCountry = itinerary.country || '';
              experienceCity = itinerary.city || '';
              experienceName = itinerary.name || '';

              const targetLat = parseFloat(itinerary.latitude) / 1e6;
              const targetLon = parseFloat(itinerary.longitude) / 1e6;
              const radiusMeters = parseInt(itinerary.proximityRadius) || 100;

              const distance = calculateDistance(
                params.userLatitude,
                params.userLongitude,
                targetLat,
                targetLon
              );

              console.log('📏 Distance check:', {
                distance,
                radiusRequired: radiusMeters,
                isWithin: distance <= radiusMeters
              });

              if (distance <= radiusMeters) {
                gpsVerified = true;
              } else if (!params.manualVerification) {
                return NextResponse.json(
                  {
                    success: false,
                    error: `You are too far from the location. You are ${Math.round(distance)}m away, but need to be within ${radiusMeters}m.`
                  },
                  { status: 400 }
                );
              }
            }
          }
        } catch (gpsError: any) {
          console.warn('⚠️ GPS/Envio lookup failed:', gpsError.message);
        }

        // Convert country name to code
        const countryData = getCountryByName(experienceCountry);
        if (!countryData) {
          return NextResponse.json(
            { success: false, error: `Unknown country: ${experienceCountry}. Cannot find matching passport.` },
            { status: 400 }
          );
        }

        console.log('🌍 Experience country:', { name: experienceCountry, code: countryData.code });

        // Look up user's passport for this country
        let passportTokenId: bigint;
        if (params.passportTokenId) {
          // User explicitly specified a passport
          passportTokenId = BigInt(params.passportTokenId);
        } else {
          // Auto-find passport by country
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const publicClient = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const passportLookupCalls = encodeFunctionData({
            abi: parseAbi(['function userPassports(address, string) view returns (uint256)']),
            functionName: 'userPassports',
            args: [userAddress as Address, countryData.code],
          });

          try {
            const passportResult = await publicClient.call({
              to: PASSPORT_NFT_ADDRESS,
              data: passportLookupCalls,
            });

            passportTokenId = passportResult.data ? BigInt(passportResult.data) : 0n;
          } catch (lookupErr: any) {
            console.error('Failed to lookup passport:', lookupErr);
            passportTokenId = 0n;
          }

          if (passportTokenId === 0n) {
            return NextResponse.json({
              success: false,
              error: `You don't have a ${experienceCountry} passport! Mint a ${experienceCountry} passport first to collect stamps there.`,
              countryRequired: experienceCountry,
              countryCode: countryData.code,
              hint: 'Visit the passport page to mint a passport for this country.',
            }, { status: 400 });
          }
        }

        console.log('🛂 Found passport:', { passportTokenId: passportTokenId.toString(), country: countryData.code });

        // V2 addItineraryStamp with placeId, googleMapsUri, latitude, longitude
        const checkinCalls = [
          {
            to: PASSPORT_NFT_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function addItineraryStamp(uint256,uint256,string,string,string,bool,string,string,int256,int256) external'
              ]),
              functionName: 'addItineraryStamp',
              args: [
                passportTokenId,
                checkinItineraryId,
                experienceName,
                experienceCity,
                experienceCountry,
                gpsVerified,
                params.placeId || '',
                params.googleMapsUri || '',
                BigInt(Math.round((params.userLatitude || 0) * 1e6)),
                BigInt(Math.round((params.userLongitude || 0) * 1e6)),
              ],
            }) as Hex,
          },
        ];

        const checkinTxHash = await executeTransaction(checkinCalls, userAddress as Address);
        console.log('✅ Passport stamped!', { txHash: checkinTxHash, passport: passportTokenId.toString(), country: experienceCountry });

        // Trigger AI stamp generation after successful stamp
        try {
          const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
          const stampRes = await fetch(`${baseUrl}/api/oracle/generate-experience-stamp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locationName: experienceName,
              city: experienceCity,
              country: experienceCountry,
              experienceType: params.experienceType || 'attraction',
              photos: params.photoProofIPFS ? [params.photoProofIPFS] : [],
              style: 'vintage',
            }),
          });
          const stampData = await stampRes.json();
          if (stampData.ipfsHash) {
            const { storeStampImage } = await import('@/lib/stamp-images');
            await storeStampImage(passportTokenId, checkinItineraryId, stampData.ipfsHash);
            console.log('🎨 AI stamp stored:', stampData.ipfsHash);
          }
        } catch (stampError) {
          console.warn('⚠️ AI stamp generation failed (stamp still recorded):', stampError);
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: checkinTxHash,
          action,
          userAddress,
          itineraryId: params.itineraryId,
          passportTokenId: passportTokenId.toString(),
          country: experienceCountry,
          countryCode: countryData.code,
          city: experienceCity,
          locationName: experienceName,
          gpsVerified,
          message: `🎫 Stamp collected! Your ${experienceCountry} passport now has a stamp from ${experienceCity}.`,
        });

      // ==================== COMPLETE LOCATION (V2 - track progress) ====================
      case 'complete_location': {
        console.log('📍 Action: complete_location');

        const { itineraryId: completeItinId, locationIndex, photoProofIPFS: locationPhotoIPFS } = params || {};

        if (!completeItinId || locationIndex === undefined) {
          return NextResponse.json(
            { success: false, error: 'Missing required: itineraryId, locationIndex' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_COMPLETE = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;

        if (!ITINERARY_NFT_COMPLETE) {
          return NextResponse.json(
            { success: false, error: 'ItineraryNFT address not configured' },
            { status: 500 }
          );
        }

        console.log('📍 Completing location:', {
          user: userAddress,
          itineraryId: completeItinId,
          locationIndex,
          hasPhoto: !!locationPhotoIPFS,
        });

        const completeLocationCalls: Call[] = [{
          to: ITINERARY_NFT_COMPLETE,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function completeLocation(uint256,address,uint256,string) external']),
            functionName: 'completeLocation',
            args: [
              BigInt(completeItinId),
              userAddress as Address,
              BigInt(locationIndex),
              locationPhotoIPFS || '',
            ],
          }) as Hex,
        }];

        const completeLocationTxHash = await executeTransaction(completeLocationCalls, userAddress as Address);
        await incrementTransactionCount(userAddress);

        console.log('✅ Location completed, TX:', completeLocationTxHash);

        return NextResponse.json({
          success: true,
          txHash: completeLocationTxHash,
          action,
          userAddress,
          itineraryId: completeItinId,
          locationIndex,
          message: `Location ${locationIndex} completed!`,
        });
      }

      // ==================== ITINERARY BURN (ItineraryNFTv2) ====================
      case 'burn_itinerary': {
        console.log('🔥 Action: burn_itinerary (ItineraryNFTv2)');

        const { tokenId } = params;
        if (!tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for burn_itinerary' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_V2 = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const burnItineraryTokenId = BigInt(tokenId);

        console.log('🔥 Burning Itinerary NFT via delegated burner:', {
          owner: userAddress,
          tokenId: burnItineraryTokenId.toString(),
          contract: ITINERARY_NFT_V2,
        });

        // Use burnItineraryForDelegated function from ItineraryNFTv2
        const burnItineraryCalls = [
          {
            to: ITINERARY_NFT_V2,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function burnItineraryForDelegated(address owner, uint256 tokenId) external']),
              functionName: 'burnItineraryForDelegated',
              args: [userAddress as Address, burnItineraryTokenId],
            }) as Hex,
          },
        ];

        const burnItineraryTxHash = await executeTransaction(burnItineraryCalls, userAddress as Address);
        console.log('✅ Itinerary NFT burned via delegated burner, TX:', burnItineraryTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: burnItineraryTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Itinerary #${params.tokenId} burned successfully`,
        });
      }

      // ==================== BURN NFT (DELEGATED) ====================
      case 'burn_nft': {
        console.log('🔥 Action: burn_nft (delegated burning via User Safe)');

        const { tokenId } = params;
        if (!tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId' },
            { status: 400 }
          );
        }

        console.log(`🔥 Burning NFT #${tokenId} for user ${userAddress}`);

        // Step 1: Ensure User Safe is registered as authorized burner
        // This will register the User Safe via Platform Safe if not already registered
        if (USE_USER_SAFES) {
          console.log('📝 Ensuring User Safe is authorized to burn...');
          const burnAuthResult = await ensureUserSafeCanBurn(userAddress);
          if (!burnAuthResult.success) {
            return NextResponse.json(
              { success: false, error: `Failed to authorize User Safe for burns: ${burnAuthResult.error}` },
              { status: 500 }
            );
          }
          console.log('✅ User Safe authorized:', burnAuthResult.safeAddress);
        }

        // Step 2: Burn the NFT via User Safe (or Platform Safe if not using User Safes)
        // Use burnNFTForDelegated function - the User Safe is now an authorized burner
        const burnCalldata = encodeFunctionData({
          abi: parseAbi(['function burnNFTForDelegated(address owner, uint256 tokenId) external']),
          functionName: 'burnNFTForDelegated',
          args: [userAddress as Address, BigInt(tokenId)],
        });

        const txHash = await executeTransaction([
          {
            to: EMPOWER_TOURS_NFT,
            data: burnCalldata as Hex,
            value: BigInt(0),
          }
        ], userAddress as Address);

        await incrementTransactionCount(userAddress);
        console.log('🔥 NFT burned successfully:', txHash);

        return NextResponse.json({
          success: true,
          txHash,
          userAddress,
          tokenId,
          message: `NFT #${tokenId} burned successfully! 5 TOURS reward sent to owner.`,
        });
      }

      // ==================== LOTTERY ENTER WITH WMON ====================
      case 'lottery_enter_mon':
      case 'lottery_enter_wmon': {
        console.log('🎰 Action: lottery_enter_wmon');

        const lotteryAddr = process.env.NEXT_PUBLIC_DAILY_PASS_LOTTERY! as Address;
        const wmonAddr = process.env.NEXT_PUBLIC_WMON! as Address;
        const lotteryEntryFee = parseEther('1'); // 1 WMON entry fee

        // 🎁 ALWAYS use platform Safe for lottery entries (gasless/free for users)
        const lotterySafe = SAFE_ACCOUNT;

        // Use FID from params, default to 1 for non-Farcaster users (contract requires fid > 0)
        const userFid = BigInt(params?.fid || 1);

        console.log('🎰 Entering lottery with WMON:', {
          entryFee: '1 WMON',
          lotteryAddress: lotteryAddr,
          wmonAddress: wmonAddr,
          safeAddress: lotterySafe,
          beneficiary: userAddress,
          userFid: userFid.toString(),
          mode: 'Platform Safe (FREE for user)',
        });

        // Three-step process: Wrap MON -> Approve WMON -> Enter Lottery
        const lotteryEnterWmonCalls = [
          // Step 1: Wrap MON to WMON (deposit)
          {
            to: wmonAddr,
            value: lotteryEntryFee,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          },
          // Step 2: Approve lottery to spend WMON
          {
            to: wmonAddr,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [lotteryAddr, lotteryEntryFee],
            }) as Hex,
          },
          // Step 3: Enter lottery with WMON for user
          {
            to: lotteryAddr,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(['function enterWithWMONFor(address beneficiary, uint256 userFid) external returns (uint256)']),
              functionName: 'enterWithWMONFor',
              args: [userAddress as Address, userFid],
            }) as Hex,
          },
        ];

        const lotteryEnterWmonTxHash = await executeTransaction(lotteryEnterWmonCalls, userAddress as Address);
        console.log('✅ Entered lottery with WMON, TX:', lotteryEnterWmonTxHash);

        // Public action - no delegation tracking needed
        return NextResponse.json({
          success: true,
          txHash: lotteryEnterWmonTxHash,
          action,
          userAddress,
          message: `Entered lottery with 1 WMON successfully (gasless)`,
        });
      }

      // ==================== LOTTERY CLAIM PRIZE ====================
      case 'lottery_claim':
        console.log('💰 Action: lottery_claim');

        const LOTTERY_CLAIM_ADDRESS = process.env.NEXT_PUBLIC_DAILY_PASS_LOTTERY! as Address;

        if (!params?.roundId) {
          return NextResponse.json(
            { success: false, error: 'Missing roundId for lottery_claim' },
            { status: 400 }
          );
        }

        const claimSafe = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : SAFE_ACCOUNT;

        const claimCalls: Call[] = [
          {
            to: LOTTERY_CLAIM_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function claimPrizeFor(address beneficiary, uint256 roundId) external']),
              functionName: 'claimPrizeFor',
              args: [userAddress as Address, BigInt(params.roundId)],
            }) as Hex,
          },
        ];

        const claimTxHash = await executeTransaction(claimCalls, userAddress as Address);
        console.log('✅ Claimed prize for round', params.roundId, 'for', userAddress, 'TX:', claimTxHash);

        // Public action - no delegation tracking needed
        return NextResponse.json({
          success: true,
          txHash: claimTxHash,
          action,
          userAddress,
          roundId: params.roundId,
          message: `Claimed prize for round ${params.roundId}`,
        });

      // ==================== CREATE EXPERIENCE (ITINERARY NFT) ====================
      case 'create_experience':
        console.log('📍 Action: create_experience');

        const ITINERARY_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_NFT! as Address;

        // Validate required params
        if (!params?.locationName || !params?.city || !params?.country) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields: locationName, city, country' },
            { status: 400 }
          );
        }

        const expCountry = params.country as string;
        const expCity = params.city as string;
        const expLocationName = params.locationName as string;
        const expDescription = (params.description as string) || `${expLocationName} in ${expCity}, ${expCountry}`;
        const expType = Number(params.experienceType || 0);
        const expLatitude = BigInt(params.latitude || 0);
        const expLongitude = BigInt(params.longitude || 0);
        const expProximityRadius = BigInt(params.proximityRadius || 100);
        const expPrice = parseEther((params.price || '10').toString()); // Price in TOURS
        const expIpfsHash = (params.ipfsImageHash as string) || '';

        console.log('📍 Creating experience:', {
          locationName: expLocationName,
          city: expCity,
          country: expCountry,
          experienceType: expType,
          latitude: expLatitude.toString(),
          longitude: expLongitude.toString(),
          price: formatEther(expPrice),
          ipfsHash: expIpfsHash,
        });

        // Build create experience call
        const createExperienceCalls = [
          {
            to: ITINERARY_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function createExperience(string memory country, string memory city, string memory locationName, string memory description, uint8 experienceType, int256 latitude, int256 longitude, uint256 proximityRadius, uint256 price, string memory ipfsImageHash) external returns (uint256)'
              ]),
              functionName: 'createExperience',
              args: [
                expCountry,
                expCity,
                expLocationName,
                expDescription,
                expType,
                expLatitude,
                expLongitude,
                expProximityRadius,
                expPrice,
                expIpfsHash
              ],
            }) as Hex,
          },
        ];

        const createExperienceTxHash = await executeTransaction(createExperienceCalls, userAddress as Address);
        console.log('✅ Created experience, TX:', createExperienceTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: createExperienceTxHash,
          action,
          userAddress,
          locationName: expLocationName,
          city: expCity,
          country: expCountry,
          message: `Experience "${expLocationName}" created successfully (gasless)`,
        });

      // ==================== SWAP MON FOR TOURS ====================
      case 'swap_mon_for_tours':
        console.log('💱 Action: swap_mon_for_tours');

        if (!params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for swap' },
            { status: 400 }
          );
        }

        // TOKEN_SWAP and TOURS_TOKEN already declared at top level
        if (!TOKEN_SWAP || !TOURS_TOKEN) {
          return NextResponse.json(
            { success: false, error: 'Swap contract not configured' },
            { status: 500 }
          );
        }

        const swapAmount = parseFloat(params.amount.toString());
        if (isNaN(swapAmount) || swapAmount <= 0 || swapAmount > 10) {
          return NextResponse.json(
            { success: false, error: 'Invalid swap amount. Must be between 0.01 and 10 MON' },
            { status: 400 }
          );
        }

        const swapMonValue = parseEther(swapAmount.toString());

        // Determine the correct Safe address
        const swapSafe = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : SAFE_ACCOUNT;

        console.log('💱 Executing swap:', {
          amount: swapAmount,
          tokenSwap: TOKEN_SWAP,
          toursToken: TOURS_TOKEN,
          safeAddress: swapSafe,
          mode: USE_USER_SAFES ? 'User Safe' : 'Platform Safe',
        });

        // Check Safe has enough MON for swap
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const client = createPublicClient({
            chain: activeChain,
            transport: http(),
          });

          const safeMonBalanceSwap = await client.getBalance({
            address: swapSafe as Address,
          });

          console.log('💰 Safe MON balance:', safeMonBalanceSwap.toString());

          if (safeMonBalanceSwap < swapMonValue) {
            const currentMON = (Number(safeMonBalanceSwap) / 1e18).toFixed(4);
            const requiredMON = swapAmount.toFixed(4);
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON in Safe. Safe has ${currentMON} MON, but swap requires ${requiredMON} MON.`
              },
              { status: 400 }
            );
          }

          // Get exchange rate to calculate expected TOURS
          const exchangeRate = await client.readContract({
            address: TOKEN_SWAP,
            abi: parseAbi(['function exchangeRate() external view returns (uint256)']),
            functionName: 'exchangeRate',
          }) as bigint;

          const expectedTours = (swapMonValue * exchangeRate) / parseEther('1');
          console.log('📊 Exchange rate:', formatEther(exchangeRate), 'TOURS per MON');
          console.log('📊 Expected TOURS:', formatEther(expectedTours));

          // Check swap contract has enough TOURS
          const swapContractToursBalance = await client.readContract({
            address: TOURS_TOKEN,
            abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
            functionName: 'balanceOf',
            args: [TOKEN_SWAP],
          }) as bigint;

          console.log('💰 Swap contract TOURS balance:', formatEther(swapContractToursBalance));

          if (swapContractToursBalance < expectedTours) {
            return NextResponse.json(
              {
                success: false,
                error: `Swap contract has insufficient TOURS tokens. Please contact support.`,
                details: `Contract has ${formatEther(swapContractToursBalance)} TOURS, but swap requires ${formatEther(expectedTours)} TOURS`
              },
              { status: 500 }
            );
          }

          // IMPORTANT: Batched calls for atomic swap
          // 1. Platform Safe calls TokenSwap.swap() with MON -> receives TOURS
          // 2. Platform Safe transfers TOURS to user
          const swapCalls = [
            // Call 1: Execute swap (Platform Safe receives TOURS)
            {
              to: TOKEN_SWAP,
              value: swapMonValue,
              data: encodeFunctionData({
                abi: parseAbi(['function swap() external payable']),
                functionName: 'swap',
                args: [],
              }) as Hex,
            },
            // Call 2: Transfer TOURS from Platform Safe to user
            {
              to: TOURS_TOKEN,
              value: 0n,
              data: encodeFunctionData({
                abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
                functionName: 'transfer',
                args: [userAddress as Address, expectedTours],
              }) as Hex,
            },
          ];

          console.log('⚡ Executing batched swap calls...');
          const swapTxHash = await executeTransaction(swapCalls, userAddress as Address, swapMonValue);
          console.log('✅ Swap executed, TX:', swapTxHash);

          await incrementTransactionCount(userAddress);
          return NextResponse.json({
            success: true,
            txHash: swapTxHash,
            action,
            userAddress,
            monSpent: swapAmount,
            toursReceived: formatEther(expectedTours),
            exchangeRate: formatEther(exchangeRate),
            message: `Swapped ${swapAmount} MON for ${formatEther(expectedTours)} TOURS successfully (gasless)`,
          });

        } catch (swapErr: any) {
          console.error('❌ Swap failed:', swapErr);
          return NextResponse.json({
            success: false,
            error: `Swap failed: ${swapErr.message || 'Unknown error'}`,
            details: swapErr.shortMessage || swapErr.message,
          }, { status: 500 });
        }

      // ==================== MUSIC BEAT MATCH (V2) ====================
      case 'beat_match_submit_guess':
        console.log('🎵 Action: beat_match_submit_guess');

        if (!params?.challengeId || !params?.songTitle) {
          return NextResponse.json(
            { success: false, error: 'Missing challenge params' },
            { status: 400 }
          );
        }

        const MUSIC_BEAT_MATCH_V2 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 as Address;

        const beatMatchCalls = [
          {
            to: MUSIC_BEAT_MATCH_V2,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function submitGuessFor(address beneficiary, uint256 challengeId, uint256 guessedArtistId, string guessedSongTitle, string guessedUsername) external'
              ]),
              functionName: 'submitGuessFor',
              args: [
                userAddress as Address,              // beneficiary
                BigInt(params.challengeId),
                BigInt(params.artistId || 0),
                params.songTitle,
                params.username || ''                // Farcaster username guess
              ],
            }) as Hex,
          },
        ];

        const beatMatchTxHash = await executeTransaction(beatMatchCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        return NextResponse.json({
          success: true,
          txHash: beatMatchTxHash,
          action,
          userAddress,
          message: 'Guess submitted successfully!',
        });

      // ==================== COUNTRY COLLECTOR (V2) ====================
      case 'country_collector_complete':
        console.log('🌍 Action: country_collector_complete');

        if (!params?.weekId || !params?.artistIndex || !params?.artistId) {
          return NextResponse.json(
            { success: false, error: 'Missing parameters' },
            { status: 400 }
          );
        }

        const COUNTRY_COLLECTOR_V2 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 as Address;

        const collectorCalls = [
          {
            to: COUNTRY_COLLECTOR_V2,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function completeArtistFor(address beneficiary, uint256 weekId, uint256 artistIndex, uint256 artistId) external'
              ]),
              functionName: 'completeArtistFor',
              args: [
                userAddress as Address,              // beneficiary
                BigInt(params.weekId),
                BigInt(params.artistIndex),
                BigInt(params.artistId)
              ],
            }) as Hex,
          },
        ];

        const collectorTxHash = await executeTransaction(collectorCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        return NextResponse.json({
          success: true,
          txHash: collectorTxHash,
          action,
          userAddress,
          message: 'Artist completed!',
        });

      // ==================== MUSIC SUBSCRIPTION ====================
      case 'music-subscribe':
        console.log('🎵 Action: music-subscribe');

        const { userFid: subUserFid, tier: subTier, amount: subAmount } = params || {};

        if (!subUserFid || subTier === undefined || !subAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: userFid, tier, amount' },
            { status: 400 }
          );
        }

        const MUSIC_SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
        if (!MUSIC_SUBSCRIPTION) {
          return NextResponse.json(
            { success: false, error: 'Music subscription contract not configured' },
            { status: 500 }
          );
        }

        const WMON_TOKEN_SUB = process.env.NEXT_PUBLIC_WMON as Address;
        const subAmountBigInt = BigInt(subAmount);

        console.log('🎵 Subscribing user:', {
          user: userAddress,
          userFid: subUserFid,
          tier: subTier,
          amount: subAmount,
        });

        // Get Safe address and check WMON balance - auto-wrap MON if needed
        const { createPublicClient: createSubClient, http: subHttp } = await import('viem');
        const { activeChain: subActiveChain } = await import('@/app/chains');
        const subRpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC;
        const subPublicClient = createSubClient({
          chain: subActiveChain,
          transport: subHttp(subRpcUrl),
        });

        const subSafeAddress = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : SAFE_ACCOUNT as Address;

        // Check Safe's WMON balance
        const safeWmonBalanceSub = await subPublicClient.readContract({
          address: WMON_TOKEN_SUB,
          abi: parseAbi(['function balanceOf(address account) external view returns (uint256)']),
          functionName: 'balanceOf',
          args: [subSafeAddress],
        });

        console.log('🎵 Safe WMON balance:', safeWmonBalanceSub.toString(), 'needed:', subAmountBigInt.toString());

        const musicSubCalls: Call[] = [];

        // If Safe doesn't have enough WMON, wrap MON to WMON first
        if (safeWmonBalanceSub < subAmountBigInt) {
          const wrapAmountSub = subAmountBigInt - safeWmonBalanceSub;
          console.log('🎵 Wrapping MON to WMON:', formatEther(wrapAmountSub));

          // Check if Safe has enough MON to wrap
          const safeMonBalanceSub = await subPublicClient.getBalance({ address: subSafeAddress });
          if (safeMonBalanceSub < wrapAmountSub) {
            return NextResponse.json(
              { success: false, error: `Insufficient balance. Your Safe needs ${formatEther(wrapAmountSub)} more MON to subscribe. Current MON: ${formatEther(safeMonBalanceSub)}` },
              { status: 400 }
            );
          }

          // Step 1: Wrap MON to WMON
          musicSubCalls.push({
            to: WMON_TOKEN_SUB,
            value: wrapAmountSub,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          });
        }

        // Step 2: Approve WMON for subscription payment
        musicSubCalls.push({
          to: WMON_TOKEN_SUB,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
            functionName: 'approve',
            args: [MUSIC_SUBSCRIPTION, subAmountBigInt],
          }) as Hex,
        });

        // Step 3: Call subscribeFor (delegation pattern)
        musicSubCalls.push({
          to: MUSIC_SUBSCRIPTION,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function subscribeFor(address user, uint256 userFid, uint8 tier) external']),
            functionName: 'subscribeFor',
            args: [userAddress as Address, BigInt(subUserFid), subTier],
          }) as Hex,
        });

        const musicSubTxHash = await executeTransaction(musicSubCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        console.log('✅ Music subscription successful, TX:', musicSubTxHash);

        return NextResponse.json({
          success: true,
          txHash: musicSubTxHash,
          action,
          userAddress,
          tier: subTier,
          message: 'Music subscription activated!',
        });

      // ==================== CLAIM ARTIST PAYOUTS ====================
      case 'claim_artist_payouts':
        console.log('💰 Action: claim_artist_payouts');

        const { monthIds: claimMonthIds, claimTours: shouldClaimTours } = params || {};

        if (!claimMonthIds || !Array.isArray(claimMonthIds) || claimMonthIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameter: monthIds (array of month IDs)' },
            { status: 400 }
          );
        }

        const CLAIM_SUBSCRIPTION = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION as Address;
        if (!CLAIM_SUBSCRIPTION) {
          return NextResponse.json(
            { success: false, error: 'Music subscription contract not configured' },
            { status: 500 }
          );
        }

        console.log('💰 Claiming payouts for months:', claimMonthIds, 'claimTours:', shouldClaimTours);

        const artistClaimCalls: Call[] = [];
        const monthIdsBigInt = claimMonthIds.map((id: number) => BigInt(id));

        // Batch claim WMON artist payouts
        artistClaimCalls.push({
          to: CLAIM_SUBSCRIPTION,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function batchClaimArtistPayouts(uint256[] calldata monthIds) external']),
            functionName: 'batchClaimArtistPayouts',
            args: [monthIdsBigInt],
          }) as Hex,
        });

        // Optionally batch claim TOURS rewards too
        if (shouldClaimTours) {
          artistClaimCalls.push({
            to: CLAIM_SUBSCRIPTION,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function batchClaimToursRewards(uint256[] calldata monthIds) external']),
              functionName: 'batchClaimToursRewards',
              args: [monthIdsBigInt],
            }) as Hex,
          });
        }

        const artistClaimTxHash = await executeTransaction(artistClaimCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        console.log('✅ Artist payout claim successful, TX:', artistClaimTxHash);

        return NextResponse.json({
          success: true,
          txHash: artistClaimTxHash,
          action,
          userAddress,
          monthIds: claimMonthIds,
          message: `Artist payouts claimed for ${claimMonthIds.length} month(s)!`,
        });

      // ==================== WMON FAUCET CLAIM ====================
      case 'faucet_claim':
        console.log('💧 Action: faucet_claim');

        const { fid: faucetFid } = params || {};

        if (!faucetFid) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameter: fid' },
            { status: 400 }
          );
        }

        const FAUCET_ADDRESS = process.env.NEXT_PUBLIC_WMON_FAUCET as Address;
        const WMON_FOR_FAUCET = process.env.NEXT_PUBLIC_WMON as Address;

        if (!FAUCET_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Faucet address not configured' },
            { status: 500 }
          );
        }

        if (!WMON_FOR_FAUCET) {
          return NextResponse.json(
            { success: false, error: 'WMON address not configured' },
            { status: 500 }
          );
        }

        // Get user's Safe address for WMON transfer (or wallet if not using user Safes)
        const userSafeForFaucet = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : userAddress as Address;

        console.log('💧 Claiming from faucet:', {
          user: userAddress,
          recipientSafe: userSafeForFaucet,
          fid: faucetFid,
          faucet: FAUCET_ADDRESS,
          platformSafe: SAFE_ACCOUNT,
        });

        // ✅ Pre-check: Verify USER'S Safe can claim for this FID
        // Using user's Safe (not Platform Safe) avoids wallet cooldown conflicts
        const { createPublicClient: createFaucetClient, http: faucetHttp } = await import('viem');
        const faucetClient = createFaucetClient({
          chain: activeChain,
          transport: faucetHttp(process.env.NEXT_PUBLIC_MONAD_RPC),
        });

        try {
          const [canClaimResult, walletCooldown, fidCooldown] = await faucetClient.readContract({
            address: FAUCET_ADDRESS,
            abi: parseAbi(['function canClaim(address user, uint256 fid) view returns (bool canClaim_, uint256 walletCooldown, uint256 fidCooldown)']),
            functionName: 'canClaim',
            args: [userSafeForFaucet, BigInt(faucetFid)],
          }) as [boolean, bigint, bigint];

          console.log('💧 Faucet canClaim check:', {
            canClaim: canClaimResult,
            userSafe: userSafeForFaucet,
            walletCooldownSeconds: Number(walletCooldown),
            fidCooldownSeconds: Number(fidCooldown),
          });

          if (!canClaimResult) {
            const walletCooldownHours = Math.ceil(Number(walletCooldown) / 3600);
            const fidCooldownHours = Math.ceil(Number(fidCooldown) / 3600);

            let cooldownMessage = 'Faucet claim not available yet.';
            if (Number(fidCooldown) > 0) {
              cooldownMessage = `Your Farcaster ID has already claimed recently. Please wait ${fidCooldownHours} hour${fidCooldownHours !== 1 ? 's' : ''} before claiming again.`;
            } else if (Number(walletCooldown) > 0) {
              cooldownMessage = `Your wallet has already claimed recently. Please wait ${walletCooldownHours} hour${walletCooldownHours !== 1 ? 's' : ''} before claiming again.`;
            }

            console.log('⚠️ Faucet claim blocked:', cooldownMessage);
            return NextResponse.json({
              success: false,
              error: cooldownMessage,
              cooldowns: {
                walletCooldownSeconds: Number(walletCooldown),
                fidCooldownSeconds: Number(fidCooldown),
              },
            }, { status: 429 });
          }
        } catch (canClaimError: any) {
          console.error('⚠️ Could not check canClaim (proceeding anyway):', canClaimError.message);
          // Continue with claim attempt - the transaction will fail if not claimable
        }

        // NEW FLOW: User's Safe claims directly from faucet
        // This avoids Platform Safe wallet cooldown conflicts
        // Step 1: Platform Safe sends MON to user's Safe for gas
        // Step 2: User's Safe claims from faucet (WMON goes directly to user's Safe)
        const GAS_FUNDING = parseEther('0.5'); // 0.5 MON for gas

        console.log('🏢 Step 1: Platform Safe sending gas funding to user Safe...');
        console.log('💰 Sending:', {
          mon: '0.5 MON (for gas)',
          recipient: userSafeForFaucet,
        });

        // Step 1: Platform Safe sends MON to user's Safe for gas
        const gasFundingCalls: Call[] = [
          {
            to: userSafeForFaucet,
            value: GAS_FUNDING,
            data: '0x' as Hex,
          },
        ];

        const gasFundingTxHash = await sendSafeTransaction(gasFundingCalls);
        console.log('✅ Gas funding sent, TX:', gasFundingTxHash);

        // Wait a moment for the tx to be indexed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: User's Safe claims from faucet directly
        console.log('🏠 Step 2: User Safe claiming from faucet...');
        const faucetClaimCalls: Call[] = [
          {
            to: FAUCET_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function claim(uint256 fid) external']),
              functionName: 'claim',
              args: [BigInt(faucetFid)],
            }) as Hex,
          },
        ];

        const faucetTxHash = await sendUserSafeTransaction(userAddress, faucetClaimCalls);
        await incrementTransactionCount(userAddress);

        console.log('✅ Faucet claim successful, TX:', faucetTxHash.txHash);
        console.log('✅ 20 WMON sent directly to user Safe:', userSafeForFaucet);

        return NextResponse.json({
          success: true,
          txHash: faucetTxHash.txHash,
          gasFundingTxHash,
          action,
          userAddress,
          recipientSafe: userSafeForFaucet,
          wmonAmount: '20 WMON',
          monAmount: '0.5 MON (for gas)',
          message: 'WMON claimed directly to your Safe wallet!',
        });

      // ==================== MAPS PAYMENT ====================
      case 'maps_payment':
        console.log('🗺️ Action: maps_payment');

        const { amount: mapsAmount } = params || {};

        if (!mapsAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameter: amount' },
            { status: 400 }
          );
        }

        const TREASURY = (process.env.TREASURY_ADDRESS || SAFE_ACCOUNT) as Address;
        const WMON_MAPS = process.env.NEXT_PUBLIC_WMON as Address;

        const mapsAmountWei = parseEther(mapsAmount);

        console.log('🗺️ Maps payment:', {
          user: userAddress,
          amount: mapsAmount,
          treasury: TREASURY,
          wmon: WMON_MAPS,
        });

        // First wrap MON to WMON, then transfer WMON to treasury
        const mapsPaymentCalls: Call[] = [
          // Step 1: Wrap native MON to WMON
          {
            to: WMON_MAPS,
            value: mapsAmountWei,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          },
          // Step 2: Transfer WMON to treasury
          {
            to: WMON_MAPS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [TREASURY, mapsAmountWei],
            }) as Hex,
          },
        ];

        const mapsPaymentTxHash = await executeTransaction(mapsPaymentCalls, userAddress as Address, mapsAmountWei);
        await incrementTransactionCount(userAddress);

        console.log('✅ Maps payment successful, TX:', mapsPaymentTxHash);

        // Auto-unwrap: if Platform Safe MON is low, unwrap WMON to native MON for gas
        try {
          const { createPublicClient, http } = await import('viem');
          const { activeChain } = await import('@/app/chains');
          const autoClient = createPublicClient({ chain: activeChain, transport: http() });

          const safeMon = await autoClient.getBalance({ address: SAFE_ACCOUNT });
          const MIN_MON_THRESHOLD = parseEther('3');
          const UNWRAP_AMOUNT = parseEther('2');

          if (safeMon < MIN_MON_THRESHOLD) {
            const safeWmon = await autoClient.readContract({
              address: WMON_MAPS,
              abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
              functionName: 'balanceOf',
              args: [SAFE_ACCOUNT],
            }) as bigint;

            const unwrapAmount = safeWmon >= UNWRAP_AMOUNT ? UNWRAP_AMOUNT : safeWmon;
            if (unwrapAmount > 0n) {
              console.log('⛽ Auto-unwrapping', (Number(unwrapAmount) / 1e18).toFixed(2), 'WMON → MON for Platform Safe gas');
              await sendSafeTransaction([{
                to: WMON_MAPS,
                value: 0n,
                data: encodeFunctionData({
                  abi: parseAbi(['function withdraw(uint256 amount) external']),
                  functionName: 'withdraw',
                  args: [unwrapAmount],
                }) as Hex,
              }]);
              console.log('✅ Platform Safe auto-funded with native MON');
            }
          }
        } catch (autoFundErr: any) {
          console.warn('⚠️ Auto-unwrap failed (non-blocking):', autoFundErr.message);
        }

        return NextResponse.json({
          success: true,
          txHash: mapsPaymentTxHash,
          action,
          userAddress,
          amount: mapsAmount,
          message: 'Maps query payment processed!',
        });

      // ==================== CREATE ITINERARY ====================
      case 'create_itinerary':
        console.log('🗺️ Action: create_itinerary');

        const {
          creatorFid,
          title: itinTitle,
          description: itinDescription,
          city,
          country,
          price: itinPrice,
          photoProofIPFS,
          locations
        } = params || {};

        if (!creatorFid || !itinTitle || !city || !country || !locations?.length) {
          return NextResponse.json(
            { success: false, error: 'Missing required: creatorFid, title, city, country, locations' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_CREATE = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;

        if (!ITINERARY_NFT_CREATE) {
          return NextResponse.json(
            { success: false, error: 'ItineraryNFT address not configured (NEXT_PUBLIC_ITINERARY_NFT)' },
            { status: 500 }
          );
        }

        const itinPriceWei = parseEther(itinPrice || '10');

        const formattedLocations = locations.map((loc: any) => ({
          name: loc.name || 'Unknown',
          placeId: loc.placeId || '',
          googleMapsUri: loc.uri || '',
          latitude: BigInt(Math.round((loc.latitude || 0) * 1e6)),
          longitude: BigInt(Math.round((loc.longitude || 0) * 1e6)),
          description: loc.description || ''
        }));

        console.log('🗺️ Creating itinerary:', { creator: userAddress, creatorFid, title: itinTitle, city, country, locationsCount: formattedLocations.length });

        // V2 uses struct-based input: (CreateItineraryInput, Location[])
        const createItineraryV2Abi = parseAbi([
          'function createItinerary((address,uint256,string,string,string,string,uint256,string),(string,string,string,int256,int256,string)[]) external returns (uint256)'
        ]);

        const oracleCreateItineraryCalls: Call[] = [{
          to: ITINERARY_NFT_CREATE,
          value: 0n,
          data: encodeFunctionData({
            abi: createItineraryV2Abi,
            functionName: 'createItinerary',
            args: [
              // CreateItineraryInput tuple
              [userAddress as Address, BigInt(creatorFid), itinTitle, itinDescription || '', city, country, itinPriceWei, photoProofIPFS || ''],
              // Location[] array
              formattedLocations,
            ],
          }) as Hex,
        }];

        const oracleItineraryTxHash = await executeTransaction(oracleCreateItineraryCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        console.log('✅ Itinerary created, TX:', oracleItineraryTxHash);

        return NextResponse.json({
          success: true,
          txHash: oracleItineraryTxHash,
          action,
          userAddress,
          title: itinTitle,
          city,
          country,
          message: `Itinerary "${itinTitle}" created! You earn 70% when others purchase.`,
        });

      // ==================== BUY RESALE (Secondary Market) ====================
      case 'buy_resale':
        console.log('🔄 Action: buy_resale');

        const { licenseId: resaleLicenseId, seller: resaleSeller, price: resalePrice, listingId: resaleListingId } = params || {};

        if (!resaleLicenseId || !resaleSeller || !resalePrice) {
          return NextResponse.json(
            { success: false, error: 'Missing required: licenseId, seller, price' },
            { status: 400 }
          );
        }

        const NFT_CONTRACT = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;

        if (!NFT_CONTRACT) {
          return NextResponse.json(
            { success: false, error: 'NFT contract not configured (NEXT_PUBLIC_NFT_CONTRACT)' },
            { status: 500 }
          );
        }

        const resalePriceWei = parseEther(resalePrice.toString());

        console.log('🔄 Executing resale purchase:', {
          buyer: userAddress,
          seller: resaleSeller,
          licenseId: resaleLicenseId,
          price: resalePrice
        });

        // executeSaleFor(seller, buyer, licenseId, salePrice)
        const resaleAbi = parseAbi([
          'function executeSaleFor(address seller, address buyer, uint256 licenseId, uint256 salePrice) external'
        ]);

        const resaleCalls: Call[] = [{
          to: NFT_CONTRACT,
          value: 0n,
          data: encodeFunctionData({
            abi: resaleAbi,
            functionName: 'executeSaleFor',
            args: [resaleSeller as Address, userAddress as Address, BigInt(resaleLicenseId), resalePriceWei],
          }) as Hex,
        }];

        const resaleTxHash = await executeTransaction(resaleCalls, userAddress as Address, 0n);
        await incrementTransactionCount(userAddress);

        console.log('✅ Resale purchase complete, TX:', resaleTxHash);

        // Mark listing as inactive if listingId provided
        if (resaleListingId) {
          try {
            const { redis } = await import('@/lib/redis');
            const listingKey = `resale:listing:${resaleListingId}`;
            const listing = await redis.get<any>(listingKey);
            if (listing) {
              listing.active = false;
              listing.soldAt = new Date().toISOString();
              listing.buyer = userAddress;
              await redis.set(listingKey, listing);
              console.log('📝 Marked listing as sold:', resaleListingId);
            }
          } catch (redisError) {
            console.warn('Failed to update listing status:', redisError);
          }
        }

        return NextResponse.json({
          success: true,
          txHash: resaleTxHash,
          action,
          userAddress,
          licenseId: resaleLicenseId,
          message: `Successfully purchased license #${resaleLicenseId} for ${resalePrice} WMON!`,
        });

      // ==================== DAO: WRAP TOURS TO vTOURS ====================
      // ==================== DAO: FUND USER SAFE ====================
      case 'dao_fund_safe': {
        console.log('🗳️ Action: dao_fund_safe');
        const { amount, safeAddress } = params || {};
        if (!amount || !safeAddress) {
          return NextResponse.json(
            { success: false, error: 'Missing amount or safeAddress for dao_fund_safe' },
            { status: 400 }
          );
        }

        // Limit funding to 10 TOURS max per request
        const requestedAmount = parseFloat(amount);
        if (requestedAmount > 10) {
          return NextResponse.json(
            { success: false, error: 'Maximum 10 TOURS per funding request' },
            { status: 400 }
          );
        }

        const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
        const fundAmountWei = parseEther(amount.toString());

        console.log('🗳️ Funding user Safe with TOURS:', { amount, safeAddress, TOURS_TOKEN });

        // Transfer TOURS from platform Safe to user's Safe
        const fundCalls: Call[] = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [safeAddress as Address, fundAmountWei],
            }) as Hex,
          },
        ];

        // Use platform Safe (not user Safe) to send the TOURS
        const fundTxHash = await sendSafeTransaction(fundCalls);
        console.log('✅ Safe funded with TOURS, TX:', fundTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: fundTxHash,
          action,
          userAddress,
          safeAddress,
          amount,
          message: `Funded Safe with ${amount} TOURS!`,
        });
      }

      // ==================== PLATFORM: SEND NATIVE MON TO ADDRESS ====================
      case 'platform_send_mon': {
        // Admin-only: send native MON from Platform Safe to any address (for gas funding etc.)
        console.log('💸 Action: platform_send_mon');
        const { recipient: monRecipient, amount: monAmount } = params || {};
        if (!monRecipient || !monAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount' },
            { status: 400 }
          );
        }
        const monAmountWei = parseEther(monAmount.toString());
        const monCalls: Call[] = [{ to: monRecipient as Address, value: monAmountWei, data: '0x' as Hex }];
        const monTxHash = await sendSafeTransaction(monCalls);
        console.log('✅ MON sent from Platform Safe, TX:', monTxHash);
        return NextResponse.json({ success: true, txHash: monTxHash, action, recipient: monRecipient, amount: monAmount });
      }

      // ==================== DAO: WRAP TOURS TO vTOURS ====================
      case 'dao_wrap': {
        console.log('🗳️ Action: dao_wrap');
        const { amount } = params || {};
        if (!amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for dao_wrap' },
            { status: 400 }
          );
        }

        const TOURS_DAO = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
        const VTOURS_DAO = process.env.NEXT_PUBLIC_VOTING_TOURS as Address;
        const wrapAmountWei = parseEther(amount.toString());

        console.log('🗳️ Wrapping TOURS to vTOURS:', { amount, TOURS_DAO, VTOURS_DAO });

        // First approve TOURS spending, then wrap and delegate to self
        const daoWrapCalls: Call[] = [
          {
            to: TOURS_DAO,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [VTOURS_DAO, wrapAmountWei],
            }) as Hex,
          },
          {
            to: VTOURS_DAO,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function wrapAndDelegate(uint256 amount, address delegatee) external']),
              functionName: 'wrapAndDelegate',
              args: [wrapAmountWei, userAddress as Address],
            }) as Hex,
          },
        ];

        const daoWrapTxHash = await executeTransaction(daoWrapCalls, userAddress as Address);
        console.log('✅ TOURS wrapped to vTOURS, TX:', daoWrapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: daoWrapTxHash,
          action,
          userAddress,
          amount,
          message: `Wrapped ${amount} TOURS to vTOURS and delegated to yourself!`,
        });
      }

      // ==================== DAO: UNWRAP vTOURS TO TOURS ====================
      case 'dao_unwrap': {
        console.log('🗳️ Action: dao_unwrap');
        const { amount: unwrapAmount } = params || {};
        if (!unwrapAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for dao_unwrap' },
            { status: 400 }
          );
        }

        const VTOURS_UNWRAP = process.env.NEXT_PUBLIC_VOTING_TOURS as Address;
        const unwrapAmountWei = parseEther(unwrapAmount.toString());

        console.log('🗳️ Unwrapping vTOURS to TOURS:', { amount: unwrapAmount, VTOURS_UNWRAP });

        const daoUnwrapCalls: Call[] = [
          {
            to: VTOURS_UNWRAP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unwrap(uint256 amount) external']),
              functionName: 'unwrap',
              args: [unwrapAmountWei],
            }) as Hex,
          },
        ];

        const daoUnwrapTxHash = await executeTransaction(daoUnwrapCalls, userAddress as Address);
        console.log('✅ vTOURS unwrapped to TOURS, TX:', daoUnwrapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: daoUnwrapTxHash,
          action,
          userAddress,
          amount: unwrapAmount,
          message: `Unwrapped ${unwrapAmount} vTOURS back to TOURS!`,
        });
      }

      // ==================== DAO: DELEGATE VOTING POWER ====================
      case 'dao_delegate': {
        console.log('🗳️ Action: dao_delegate');
        const { delegatee } = params || {};
        if (!delegatee) {
          return NextResponse.json(
            { success: false, error: 'Missing delegatee address for dao_delegate' },
            { status: 400 }
          );
        }

        const VTOURS_DELEGATE = process.env.NEXT_PUBLIC_VOTING_TOURS as Address;

        console.log('🗳️ Delegating voting power to:', { delegatee, VTOURS_DELEGATE });

        const daoDelegateCalls: Call[] = [
          {
            to: VTOURS_DELEGATE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function delegate(address delegatee) external']),
              functionName: 'delegate',
              args: [delegatee as Address],
            }) as Hex,
          },
        ];

        const daoDelegateTxHash = await executeTransaction(daoDelegateCalls, userAddress as Address);
        console.log('✅ Voting power delegated, TX:', daoDelegateTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: daoDelegateTxHash,
          action,
          userAddress,
          delegatee,
          message: `Delegated voting power to ${delegatee.slice(0, 6)}...${delegatee.slice(-4)}!`,
        });
      }

      // ==================== DAO: CREATE BURN PROPOSAL ====================
      case 'dao_create_burn_proposal': {
        console.log('🔥 Action: dao_create_burn_proposal');
        const { tokenId, reason, nftContract } = params || {};
        if (!tokenId || !reason) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId or reason for burn proposal' },
            { status: 400 }
          );
        }

        const DAO_CONTRACT = process.env.NEXT_PUBLIC_DAO as Address;
        const NFT_CONTRACT = (nftContract || process.env.NEXT_PUBLIC_NFT_CONTRACT || process.env.NEXT_PUBLIC_NFT_CONTRACT) as Address;

        if (!DAO_CONTRACT) {
          return NextResponse.json(
            { success: false, error: 'DAO contract not configured' },
            { status: 500 }
          );
        }

        console.log('🔥 Creating burn proposal:', { tokenId, reason, DAO_CONTRACT, NFT_CONTRACT });

        // Encode the burnStolenContent call that will be executed if proposal passes
        const burnCalldata = encodeFunctionData({
          abi: parseAbi(['function burnStolenContent(uint256 tokenId, string memory reason) external']),
          functionName: 'burnStolenContent',
          args: [BigInt(tokenId), reason],
        });

        // Create proposal description
        const proposalDescription = `Burn Stolen/Infringing NFT #${tokenId}\n\nReason: ${reason}\n\nThis proposal will burn token #${tokenId} from the EmpowerTours NFT contract if it passes the governance vote.`;

        // Create the propose call
        // Governor.propose(targets[], values[], calldatas[], description)
        const proposeCalls: Call[] = [
          {
            to: DAO_CONTRACT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) external returns (uint256)'
              ]),
              functionName: 'propose',
              args: [
                [NFT_CONTRACT],  // targets
                [0n],            // values (no ETH)
                [burnCalldata],  // calldatas
                proposalDescription,
              ],
            }) as Hex,
          },
        ];

        const proposeTxHash = await executeTransaction(proposeCalls, userAddress as Address);
        console.log('✅ Burn proposal created, TX:', proposeTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: proposeTxHash,
          action,
          userAddress,
          tokenId,
          reason,
          message: `Burn proposal created for token #${tokenId}! The DAO will vote on this proposal.`,
        });
      }

      // ==================== LIVE RADIO: VOICE NOTE PAYMENT ====================
      case 'radio_voice_note': {
        console.log('📻 Action: radio_voice_note');
        const { noteType } = params || {};
        if (!noteType || !['shoutout', 'ad'].includes(noteType)) {
          return NextResponse.json(
            { success: false, error: 'Invalid note type. Must be "shoutout" or "ad"' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || process.env.NEXT_PUBLIC_WMON_TOKEN) as Address;
        const RADIO_TREASURY = process.env.RADIO_TREASURY_ADDRESS as Address || SAFE_ACCOUNT;

        // Pricing: 0.5 WMON for shoutout, 2 WMON for ad
        const amount = noteType === 'shoutout' ? '0.5' : '2';
        const amountWei = parseEther(amount);

        console.log('📻 Voice note payment:', { noteType, amount, WMON_ADDRESS, RADIO_TREASURY });

        // Get user's Safe address (transactions are executed from Safe, not EOA)
        const voiceUserSafe = await getUserSafeAddress(userAddress as Address);
        console.log('📻 Voice note user Safe address:', voiceUserSafe);

        // Create public client for balance checks
        const { createPublicClient: createVoiceClient, http: voiceHttp } = await import('viem');
        const { activeChain: voiceActiveChain } = await import('@/app/chains');
        const voiceRpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC;
        const voicePublicClient = createVoiceClient({
          chain: voiceActiveChain,
          transport: voiceHttp(voiceRpcUrl),
        });

        // Check Safe's WMON balance to see if we need to wrap MON first
        const safeWmonBalanceVoice = await voicePublicClient.readContract({
          address: WMON_ADDRESS,
          abi: parseAbi(['function balanceOf(address account) external view returns (uint256)']),
          functionName: 'balanceOf',
          args: [voiceUserSafe],
        });

        console.log('📻 Safe WMON balance:', safeWmonBalanceVoice.toString(), 'needed:', amountWei.toString());

        const radioVoiceCalls: Call[] = [];

        // If Safe doesn't have enough WMON, wrap MON to WMON first
        if (safeWmonBalanceVoice < amountWei) {
          const wrapAmountVoice = amountWei - safeWmonBalanceVoice;
          console.log('📻 Wrapping MON to WMON:', wrapAmountVoice.toString());

          // Check if Safe has enough MON to wrap
          const safeMonBalanceVoice = await voicePublicClient.getBalance({ address: voiceUserSafe });
          if (safeMonBalanceVoice < wrapAmountVoice) {
            return NextResponse.json(
              { success: false, error: `Insufficient balance. Your Safe needs ${formatEther(wrapAmountVoice)} MON for voice note.` },
              { status: 400 }
            );
          }

          // Step 1: Wrap MON to WMON
          radioVoiceCalls.push({
            to: WMON_ADDRESS,
            value: wrapAmountVoice,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          });
        }

        // Step 2: Transfer WMON to treasury
        radioVoiceCalls.push({
          to: WMON_ADDRESS,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
            functionName: 'transfer',
            args: [RADIO_TREASURY, amountWei],
          }) as Hex,
        });

        const radioVoiceTxHash = await executeTransaction(radioVoiceCalls, userAddress as Address);
        console.log('✅ Voice note payment TX:', radioVoiceTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: radioVoiceTxHash,
          action,
          userAddress,
          noteType,
          amount,
          message: `Paid ${amount} WMON for ${noteType}!`,
        });
      }

      // ==================== LIVE RADIO: QUEUE SONG (ON-CHAIN) ====================
      case 'radio_queue_song': {
        console.log('📻 Action: radio_queue_song (on-chain)');

        const { masterTokenId, tipAmount = '0', userFid = '0' } = params || {};
        if (!masterTokenId) {
          return NextResponse.json(
            { success: false, error: 'masterTokenId required' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || process.env.NEXT_PUBLIC_WMON_TOKEN) as Address;
        const LIVE_RADIO_ADDRESS = process.env.NEXT_PUBLIC_LIVE_RADIO as Address;

        if (!LIVE_RADIO_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'LiveRadio contract not configured' },
            { status: 500 }
          );
        }

        // Pricing: 1 WMON to queue a song (plus optional tip)
        const baseAmount = parseEther('1');
        const tipAmountWei = parseEther(tipAmount);
        const totalAmount = baseAmount + tipAmountWei;

        console.log('📻 Queue song on-chain:', { masterTokenId, userFid, totalAmount: totalAmount.toString(), tipAmount, LIVE_RADIO_ADDRESS });

        // Get user's Safe address (transactions are executed from Safe, not EOA)
        const radioUserSafe = await getUserSafeAddress(userAddress as Address);
        console.log('📻 User Safe address:', radioUserSafe);

        // Create public client for balance checks
        const { createPublicClient: createRadioClient, http: radioHttp } = await import('viem');
        const { activeChain: radioActiveChain } = await import('@/app/chains');
        const radioRpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC;
        const radioPublicClient = createRadioClient({
          chain: radioActiveChain,
          transport: radioHttp(radioRpcUrl),
        });

        // Check Safe's WMON balance to see if we need to wrap MON first
        const safeWmonBalance = await radioPublicClient.readContract({
          address: WMON_ADDRESS,
          abi: parseAbi(['function balanceOf(address account) external view returns (uint256)']),
          functionName: 'balanceOf',
          args: [radioUserSafe],
        });

        console.log('📻 Safe WMON balance:', safeWmonBalance.toString(), 'needed:', totalAmount.toString());

        const radioQueueCalls: Call[] = [];

        // If Safe doesn't have enough WMON, wrap MON to WMON first
        if (safeWmonBalance < totalAmount) {
          const wrapAmount = totalAmount - safeWmonBalance;
          console.log('📻 Wrapping MON to WMON:', wrapAmount.toString());

          // Check if Safe has enough MON to wrap
          const safeMonBalance = await radioPublicClient.getBalance({ address: radioUserSafe });
          if (safeMonBalance < wrapAmount) {
            return NextResponse.json(
              { success: false, error: `Insufficient balance. Your Safe needs ${formatEther(wrapAmount)} MON to queue song.` },
              { status: 400 }
            );
          }

          // Step 1: Wrap MON to WMON
          radioQueueCalls.push({
            to: WMON_ADDRESS,
            value: wrapAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          });
        }

        // Step 2: Approve WMON to LiveRadio contract
        radioQueueCalls.push({
          to: WMON_ADDRESS,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
            functionName: 'approve',
            args: [LIVE_RADIO_ADDRESS, totalAmount],
          }) as Hex,
        });

        // Step 3: Call queueSong on LiveRadio contract
        radioQueueCalls.push({
          to: LIVE_RADIO_ADDRESS,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function queueSong(uint256 masterTokenId, uint256 userFid, uint256 tipAmount) external']),
            functionName: 'queueSong',
            args: [BigInt(masterTokenId), BigInt(userFid), tipAmountWei],
          }) as Hex,
        });

        const radioQueueTxHash = await executeTransaction(radioQueueCalls, userAddress as Address);
        console.log('✅ Queue song on-chain TX:', radioQueueTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: radioQueueTxHash,
          action,
          userAddress,
          masterTokenId,
          tipAmount,
          message: `Song #${masterTokenId} queued on-chain!`,
        });
      }

      // ==================== LIVE RADIO: MARK SONG PLAYED (ADMIN) ====================
      case 'radio_mark_played': {
        console.log('📻 Action: radio_mark_played');

        const { queueIndex } = params || {};
        if (queueIndex === undefined) {
          return NextResponse.json(
            { success: false, error: 'queueIndex required' },
            { status: 400 }
          );
        }

        const LIVE_RADIO_ADDRESS = process.env.NEXT_PUBLIC_LIVE_RADIO as Address;

        if (!LIVE_RADIO_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'LiveRadio contract not configured' },
            { status: 500 }
          );
        }

        console.log('📻 Marking song as played:', { queueIndex, LIVE_RADIO_ADDRESS });

        // Call markSongPlayed via platform Safe (owner)
        const markPlayedCalls: Call[] = [
          {
            to: LIVE_RADIO_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function markSongPlayed(uint256 queueIndex) external']),
              functionName: 'markSongPlayed',
              args: [BigInt(queueIndex)],
            }) as Hex,
          },
        ];

        const markPlayedTxHash = await sendSafeTransaction(markPlayedCalls);
        console.log('✅ Mark played TX:', markPlayedTxHash);

        return NextResponse.json({
          success: true,
          txHash: markPlayedTxHash,
          action,
          queueIndex,
          message: `Song at queue index ${queueIndex} marked as played on-chain`,
        });
      }

      // ==================== LIVE RADIO: CLAIM LISTENER REWARDS ====================
      case 'radio_claim_rewards': {
        console.log('📻 Action: radio_claim_rewards');
        const { amount: rewardAmount } = params || {};
        if (!rewardAmount || parseFloat(rewardAmount) <= 0) {
          return NextResponse.json(
            { success: false, error: 'No rewards to claim' },
            { status: 400 }
          );
        }

        const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
        const rewardAmountWei = parseEther(rewardAmount.toString());

        // Send rewards to user's Safe, not their wallet
        const userSafe = await getUserSafeAddress(userAddress as Address);
        console.log('📻 Claiming radio rewards:', { amount: rewardAmount, TOURS_TOKEN, userAddress, userSafe });

        // Transfer TOURS from platform Safe to user's Safe
        const radioRewardCalls: Call[] = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [userSafe as Address, rewardAmountWei],
            }) as Hex,
          },
        ];

        // Use platform Safe for rewards distribution
        const radioRewardTxHash = await sendSafeTransaction(radioRewardCalls);
        console.log('✅ Radio rewards claimed TX:', radioRewardTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: radioRewardTxHash,
          action,
          userAddress,
          amount: rewardAmount,
          message: `Claimed ${rewardAmount} TOURS listening rewards!`,
        });
      }

      // ==================== LIVE RADIO: SKIP TO RANDOM ====================
      case 'radio_skip_random': {
        console.log('🎲 Action: radio_skip_random');

        const SKIP_PRICE = parseEther('1'); // 1 MON to skip
        const SKIP_WMON = process.env.NEXT_PUBLIC_WMON as Address;

        if (!SKIP_WMON) {
          return NextResponse.json(
            { success: false, error: 'WMON contract not configured' },
            { status: 500 }
          );
        }

        // Charge 1 MON: wrap to WMON and transfer to platform Safe
        const skipCalls: Call[] = [
          {
            to: SKIP_WMON,
            value: SKIP_PRICE,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          },
          {
            to: SKIP_WMON,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [SAFE_ACCOUNT, SKIP_PRICE],
            }) as Hex,
          },
        ];

        const skipTxHash = await executeTransaction(skipCalls, userAddress as Address, SKIP_PRICE);
        console.log('✅ Skip payment TX:', skipTxHash);

        await incrementTransactionCount(userAddress);

        // Tell the live-radio API to skip to a new random song from Envio
        let skipResult: any = null;
        try {
          const skipRes = await fetch(`${APP_URL}/api/live-radio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'skip_to_random',
              userAddress,
              userFid: fid || 0,
              txHash: skipTxHash,
            }),
          });
          skipResult = await skipRes.json();
          console.log('🎲 Skip result:', skipResult);
        } catch (skipErr: any) {
          console.error('🎲 Skip API call failed:', skipErr.message);
        }

        // Post Farcaster cast about the skip (non-blocking)
        if (fid) {
          fetch(`${APP_URL}/api/cast-nft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'radio_skip_random',
              fid,
              txHash: skipTxHash,
              userAddress,
            }),
          }).catch(err => console.error('[RadioSkip] Cast failed:', err.message));
        }

        return NextResponse.json({
          success: true,
          txHash: skipTxHash,
          action,
          userAddress,
          message: skipResult?.message || 'Skipped to new random song!',
          song: skipResult?.song || null,
        });
      }

      // ==================== LIVE RADIO: START RADIO (ADMIN) ====================
      case 'radio_start': {
        console.log('📻 Action: radio_start (on-chain)');

        const LIVE_RADIO_START_ADDRESS = process.env.NEXT_PUBLIC_LIVE_RADIO as Address;
        if (!LIVE_RADIO_START_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'LiveRadio contract not configured' },
            { status: 500 }
          );
        }

        // Call startRadio() from platform Safe (which is the contract owner)
        const startRadioCalls: Call[] = [
          {
            to: LIVE_RADIO_START_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function startRadio() external']),
              functionName: 'startRadio',
            }) as Hex,
          },
        ];

        // Use platform Safe directly (not user Safe) since it's the contract owner
        const startRadioTxHash = await sendSafeTransaction(startRadioCalls);
        console.log('✅ startRadio TX:', startRadioTxHash);

        return NextResponse.json({
          success: true,
          txHash: startRadioTxHash,
          action,
          message: 'Radio started on-chain! isLive is now true.',
        });
      }

      // ==================== MIRRORMATE: REGISTER GUIDE ====================
      case 'mirrormate_register': {
        console.log('🧳 Action: mirrormate_register');

        const { guideFid, passportTokenId, countries, hourlyRateWMON, hourlyRateTOURS, bio, profileImageIPFS } = params || {};
        if (!guideFid || !passportTokenId || !countries || !bio) {
          return NextResponse.json(
            { success: false, error: 'Missing required registration params' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        // Get user's Safe address for passport ownership check
        const registrySafe = await getUserSafeAddress(userAddress as Address);
        console.log('🧳 Registering guide via User Safe:', registrySafe);

        const registerCalls: Call[] = [
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function registerGuideFor(address passportOwner, uint256 guideFid, uint256 passportTokenId, string[] countries, uint256 hourlyRateWMON, uint256 hourlyRateTOURS, string bio, string profileImageIPFS) external'
              ]),
              functionName: 'registerGuideFor',
              args: [
                registrySafe, // passportOwner is the Safe (which owns the passport)
                BigInt(guideFid),
                BigInt(passportTokenId),
                countries as string[],
                parseEther(hourlyRateWMON?.toString() || '10'),
                parseEther(hourlyRateTOURS?.toString() || '100'),
                bio,
                profileImageIPFS || '',
              ],
            }) as Hex,
          },
        ];

        const registerTxHash = await executeTransaction(registerCalls, userAddress as Address);
        console.log('✅ Guide registration TX:', registerTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: registerTxHash,
          action,
          userAddress,
          guideFid,
          message: `Registered as tour guide!`,
        });
      }

      // ==================== MIRRORMATE: UPDATE GUIDE ====================
      case 'mirrormate_update': {
        console.log('🧳 Action: mirrormate_update');

        const { hourlyRateWMON: updateRate, hourlyRateTOURS: updateTours, bio: updateBio, profileImageIPFS: updateImage, active } = params || {};

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Updating guide profile via User Safe');

        const updateCalls: Call[] = [
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function updateGuide(uint256 hourlyRateWMON, uint256 hourlyRateTOURS, string bio, string profileImageIPFS, bool active) external'
              ]),
              functionName: 'updateGuide',
              args: [
                parseEther(updateRate?.toString() || '10'),
                parseEther(updateTours?.toString() || '100'),
                updateBio || '',
                updateImage || '',
                active !== false, // default to true
              ],
            }) as Hex,
          },
        ];

        const updateTxHash = await executeTransaction(updateCalls, userAddress as Address);
        console.log('✅ Guide update TX:', updateTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: updateTxHash,
          action,
          userAddress,
          message: `Guide profile updated!`,
        });
      }

      // ==================== MIRRORMATE: SKIP GUIDE ====================
      case 'mirrormate_skip': {
        console.log('🧳 Action: mirrormate_skip');

        const { travelerFid, guideFid: skipGuideFid } = params || {};
        if (!travelerFid || !skipGuideFid) {
          return NextResponse.json(
            { success: false, error: 'Missing travelerFid or guideFid' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || process.env.NEXT_PUBLIC_WMON_TOKEN) as Address;

        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Skipping guide via User Safe:', { travelerFid, skipGuideFid });

        // Get user's Safe address
        const skipUserSafe = await getUserSafeAddress(userAddress as Address);

        // Pre-approve WMON in case daily free skips are exhausted (5 WMON per paid skip)
        const skipCalls: Call[] = [
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [TOUR_GUIDE_REGISTRY, parseEther('5')], // 5 WMON for paid skip
            }) as Hex,
          },
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function skipGuide(uint256 travelerFid, uint256 guideFid) external']),
              functionName: 'skipGuide',
              args: [BigInt(travelerFid), BigInt(skipGuideFid)],
            }) as Hex,
          },
        ];

        const skipTxHash = await executeTransaction(skipCalls, userAddress as Address);
        console.log('✅ Skip guide TX:', skipTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: skipTxHash,
          action,
          userAddress,
          guideFid: skipGuideFid,
          message: `Skipped guide #${skipGuideFid}`,
        });
      }

      // ==================== MIRRORMATE: REQUEST CONNECTION ====================
      case 'mirrormate_connect': {
        console.log('🧳 Action: mirrormate_connect');

        const { travelerFid: connectTraveler, guideFid: connectGuide, meetupType, message: connectMsg } = params || {};
        if (!connectTraveler || !connectGuide) {
          return NextResponse.json(
            { success: false, error: 'Missing travelerFid or guideFid' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || process.env.NEXT_PUBLIC_WMON_TOKEN) as Address;

        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Requesting connection via User Safe:', { connectTraveler, connectGuide, meetupType });

        // Pre-approve WMON in case daily free connections are exhausted (10 WMON per paid connection)
        const connectCalls: Call[] = [
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [TOUR_GUIDE_REGISTRY, parseEther('10')], // 10 WMON for paid connection
            }) as Hex,
          },
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function requestConnection(uint256 travelerFid, uint256 guideFid, string meetupType, string message) external returns (uint256)'
              ]),
              functionName: 'requestConnection',
              args: [
                BigInt(connectTraveler),
                BigInt(connectGuide),
                meetupType || 'meetup',
                connectMsg || 'Would love to connect!',
              ],
            }) as Hex,
          },
        ];

        const connectTxHash = await executeTransaction(connectCalls, userAddress as Address);
        console.log('✅ Connection request TX:', connectTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: connectTxHash,
          action,
          userAddress,
          guideFid: connectGuide,
          message: `Connection request sent to guide #${connectGuide}!`,
        });
      }

      // ==================== MIRRORMATE: BOOK GUIDE ====================
      case 'book_guide': {
        console.log('🧳 Action: book_guide');

        const { travelerFid: bookTraveler, guideFid: bookGuide, hoursDuration, paymentToken, totalCost } = params || {};
        if (!bookTraveler || !bookGuide || !hoursDuration || !totalCost) {
          return NextResponse.json(
            { success: false, error: 'Missing booking parameters' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
        const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || paymentToken) as Address;

        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Creating booking via User Safe:', { bookTraveler, bookGuide, hoursDuration, totalCost });

        // Approve WMON and then book guide
        const bookCalls: Call[] = [
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [TOUR_GUIDE_REGISTRY, BigInt(totalCost)],
            }) as Hex,
          },
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function bookGuideFor(address beneficiary, uint256 travelerFid, uint256 guideFid, uint256 hoursDuration, address paymentToken) external returns (uint256)'
              ]),
              functionName: 'bookGuideFor',
              args: [
                userAddress as Address,
                BigInt(bookTraveler),
                BigInt(bookGuide),
                BigInt(hoursDuration),
                WMON_ADDRESS,
              ],
            }) as Hex,
          },
        ];

        const bookTxHash = await executeTransaction(bookCalls, userAddress as Address);
        console.log('✅ Booking TX:', bookTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: bookTxHash,
          action,
          userAddress,
          guideFid: bookGuide,
          hours: hoursDuration,
          message: `Successfully booked guide #${bookGuide} for ${hoursDuration} hours!`,
        });
      }

      // ==================== MIRRORMATE: MARK TOUR COMPLETE ====================
      case 'mark_tour_complete': {
        console.log('🧳 Action: mark_tour_complete');

        const { bookingId: completeBookingId, proofIPFS } = params || {};
        if (!completeBookingId || !proofIPFS) {
          return NextResponse.json(
            { success: false, error: 'Missing bookingId or proofIPFS' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;

        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Marking tour complete:', { completeBookingId, proofIPFS });

        const completeCalls: Call[] = [
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function markTourComplete(uint256 bookingId, string memory proofIPFS) external'
              ]),
              functionName: 'markTourComplete',
              args: [BigInt(completeBookingId), proofIPFS],
            }) as Hex,
          },
        ];

        const completeTxHash = await executeTransaction(completeCalls, userAddress as Address);
        console.log('✅ Mark complete TX:', completeTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: completeTxHash,
          action,
          bookingId: completeBookingId,
          message: 'Tour marked as complete! Waiting for traveler confirmation.',
        });
      }

      // ==================== MIRRORMATE: CONFIRM AND RATE ====================
      case 'confirm_and_rate': {
        console.log('🧳 Action: confirm_and_rate');

        const { bookingId: rateBookingId, rating: rateRating, reviewIPFS } = params || {};
        if (!rateBookingId || rateRating === undefined) {
          return NextResponse.json(
            { success: false, error: 'Missing bookingId or rating' },
            { status: 400 }
          );
        }

        const TOUR_GUIDE_REGISTRY = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;

        if (!TOUR_GUIDE_REGISTRY) {
          return NextResponse.json(
            { success: false, error: 'TourGuideRegistry not configured' },
            { status: 500 }
          );
        }

        console.log('🧳 Confirming and rating:', { rateBookingId, rateRating, reviewIPFS });

        const rateCalls: Call[] = [
          {
            to: TOUR_GUIDE_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function confirmAndRate(uint256 bookingId, uint256 rating, string memory reviewIPFS) external'
              ]),
              functionName: 'confirmAndRate',
              args: [BigInt(rateBookingId), BigInt(rateRating), reviewIPFS || ''],
            }) as Hex,
          },
        ];

        const rateTxHash = await executeTransaction(rateCalls, userAddress as Address);
        console.log('✅ Confirm & rate TX:', rateTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: rateTxHash,
          action,
          bookingId: rateBookingId,
          rating: rateRating,
          message: 'Tour confirmed and rated successfully!',
        });
      }

      // ==================== PURCHASE CLIMBING LOCATION ====================
      case 'purchase_climb': {
        const CLIMBING_CONTRACT = (process.env.NEXT_PUBLIC_CLIMBING_LOCATIONS || '') as Address;
        const WMON_CLIMBING = process.env.NEXT_PUBLIC_WMON as Address;

        const {
          locationId: purchaseLocationId,
          priceWmon: purchasePrice,
          buyerFid,
          buyerTelegramId,
        } = params || {};

        if (!purchaseLocationId || !purchasePrice) {
          return NextResponse.json(
            { success: false, error: 'Location ID and price are required' },
            { status: 400 }
          );
        }

        if (!buyerFid && !buyerTelegramId) {
          return NextResponse.json(
            { success: false, error: 'Must have either Farcaster FID or Telegram ID' },
            { status: 400 }
          );
        }

        const purchasePriceWei = BigInt(purchasePrice);
        console.log('🧗 Purchasing climbing location:', { locationId: purchaseLocationId, price: formatEther(purchasePriceWei) });

        // Check if user Safe has enough WMON
        const { createPublicClient, http } = await import('viem');
        const purchaseClient = createPublicClient({
          chain: activeChain,
          transport: http(activeChain.rpcUrls.default.http[0]),
        });

        const userSafeForPurchase = await getUserSafeAddress(userAddress);

        const safeWmonBalancePurchase = await purchaseClient.readContract({
          address: WMON_CLIMBING,
          abi: parseAbi(['function balanceOf(address account) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [userSafeForPurchase],
        });

        console.log('🧗 Safe WMON balance:', formatEther(safeWmonBalancePurchase), 'needed:', formatEther(purchasePriceWei));

        const purchaseCalls: Call[] = [];

        // If Safe doesn't have enough WMON, wrap MON first
        if (safeWmonBalancePurchase < purchasePriceWei) {
          const wrapAmountPurchase = purchasePriceWei - safeWmonBalancePurchase;
          console.log('🧗 Wrapping MON to WMON:', formatEther(wrapAmountPurchase));

          purchaseCalls.push({
            to: WMON_CLIMBING,
            value: wrapAmountPurchase,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          });
        }

        // Approve WMON for ClimbingLocationsV1
        purchaseCalls.push({
          to: WMON_CLIMBING,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
            functionName: 'approve',
            args: [CLIMBING_CONTRACT, purchasePriceWei],
          }) as Hex,
        });

        // Purchase the location
        purchaseCalls.push({
          to: CLIMBING_CONTRACT,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi([
              'function purchaseLocation(uint256 locationId, uint256 buyerFid, uint256 buyerTelegramId) external returns (uint256)'
            ]),
            functionName: 'purchaseLocation',
            args: [
              BigInt(purchaseLocationId),
              BigInt(buyerFid || 0),
              BigInt(buyerTelegramId || 0),
            ],
          }) as Hex,
        });

        const purchaseTxHash = await executeTransaction(purchaseCalls, userAddress as Address);
        console.log('✅ Climbing location purchased, TX:', purchaseTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: purchaseTxHash,
          action,
          locationId: purchaseLocationId,
          message: `Purchased access to climbing location #${purchaseLocationId}!`,
        });
      }

      // ==================== CREATE CLIMBING LOCATION ====================
      case 'create_climb': {
        const CLIMBING_CONTRACT = (process.env.NEXT_PUBLIC_CLIMBING_LOCATIONS || '') as Address;
        const WMON_CLIMBING = process.env.NEXT_PUBLIC_WMON as Address;
        const LOCATION_CREATION_COST = parseEther('35'); // 35 WMON

        const {
          creatorFid,
          creatorTelegramId,
          name,
          difficulty,
          latitude,
          longitude,
          photoProofIPFS,
          description,
          priceWmon,
        } = params || {};

        // Validate required fields
        if (!name || !photoProofIPFS) {
          return NextResponse.json(
            { success: false, error: 'Name and photo are required' },
            { status: 400 }
          );
        }

        if (!creatorFid && !creatorTelegramId) {
          return NextResponse.json(
            { success: false, error: 'Must have either Farcaster FID or Telegram ID' },
            { status: 400 }
          );
        }

        console.log('🧗 Creating climbing location:', { name, difficulty, latitude, longitude });

        // Check if user Safe has enough WMON, or needs to wrap MON
        const { createPublicClient, http } = await import('viem');
        const climbClient = createPublicClient({
          chain: activeChain,
          transport: http(activeChain.rpcUrls.default.http[0]),
        });

        // Get user Safe address
        const userSafeForClimb = await getUserSafeAddress(userAddress);

        // Check WMON balance
        const safeWmonBalance = await climbClient.readContract({
          address: WMON_CLIMBING,
          abi: parseAbi(['function balanceOf(address account) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [userSafeForClimb],
        });

        console.log('🧗 Safe WMON balance:', formatEther(safeWmonBalance), 'needed: 35 WMON');

        const climbCalls: Call[] = [];

        // If Safe doesn't have enough WMON, wrap MON first
        if (safeWmonBalance < LOCATION_CREATION_COST) {
          const wrapAmount = LOCATION_CREATION_COST - safeWmonBalance;
          console.log('🧗 Wrapping MON to WMON:', formatEther(wrapAmount));

          // Step 1: Wrap MON to WMON
          climbCalls.push({
            to: WMON_CLIMBING,
            value: wrapAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          });
        }

        // Step 2: Approve WMON for ClimbingLocationsV1
        climbCalls.push({
          to: WMON_CLIMBING,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
            functionName: 'approve',
            args: [CLIMBING_CONTRACT, LOCATION_CREATION_COST],
          }) as Hex,
        });

        // Step 3: Create the location
        climbCalls.push({
          to: CLIMBING_CONTRACT,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi([
              'function createLocation(uint256 creatorFid, uint256 creatorTelegramId, string name, string difficulty, int256 latitude, int256 longitude, string photoProofIPFS, string description, uint256 priceWmon) external returns (uint256)'
            ]),
            functionName: 'createLocation',
            args: [
              BigInt(creatorFid || 0),
              BigInt(creatorTelegramId || 0),
              name,
              difficulty || 'Unknown',
              BigInt(latitude || 0),
              BigInt(longitude || 0),
              photoProofIPFS,
              description || name,
              BigInt(priceWmon || parseEther('5').toString()),
            ],
          }) as Hex,
        });

        const climbTxHash = await executeTransaction(climbCalls, userAddress as Address);
        console.log('✅ Climbing location created, TX:', climbTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: climbTxHash,
          action,
          message: `Created climbing location "${name}" for 35 WMON!`,
        });
      }

      // ==================== DAO: CREATE DEPLOYMENT PROPOSAL ====================
      case 'dao_create_deployment_proposal': {
        console.log('🏗️ Action: dao_create_deployment_proposal');
        const { prompt, treasuryAllocation, contractType } = params || {};
        if (!prompt || prompt.trim().length < 10) {
          return NextResponse.json(
            { success: false, error: 'Prompt must be at least 10 characters' },
            { status: 400 }
          );
        }

        const allocationBps = Math.min(Math.max(Number(treasuryAllocation) || 0, 0), 500);

        const DAO_FACTORY = process.env.NEXT_PUBLIC_DAO_CONTRACT_FACTORY as Address;
        const DAO_GOVERNOR = process.env.NEXT_PUBLIC_DAO as Address;

        if (!DAO_FACTORY || !DAO_GOVERNOR) {
          return NextResponse.json(
            { success: false, error: 'DAO Factory or Governor not configured' },
            { status: 500 }
          );
        }

        console.log('🏗️ Creating deployment proposal:', { prompt: prompt.substring(0, 50), allocationBps, contractType });

        // Step 1: Register proposal in the factory (100 MON fee, payable)
        const proposalFeeMON = parseEther('100'); // 100 MON
        const registerCalls: Call[] = [
          {
            to: DAO_FACTORY,
            value: proposalFeeMON,
            data: encodeFunctionData({
              abi: parseAbi(['function registerProposal(string prompt, uint256 treasuryAllocation) external payable returns (uint256)']),
              functionName: 'registerProposal',
              args: [prompt, BigInt(allocationBps)],
            }) as Hex,
          },
        ];

        // Step 2: Create Governor proposal to executeApprovedDeployment + allocateTreasury
        const executeCalldata = encodeFunctionData({
          abi: parseAbi(['function executeApprovedDeployment(uint256 id) external']),
          functionName: 'executeApprovedDeployment',
          args: [0n], // Will be updated by backend after factory registration
        });

        const proposalDescription = `Deploy Contract Proposal\n\nType: ${contractType || 'Custom'}\nTreasury: ${(allocationBps / 100).toFixed(1)}%\nFee: 100 MON (50 treasury + 50 platform)\n\n${prompt}`;

        const governorProposeCalls: Call[] = [
          {
            to: DAO_GOVERNOR,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) external returns (uint256)'
              ]),
              functionName: 'propose',
              args: [
                [DAO_FACTORY],
                [0n],
                [executeCalldata],
                proposalDescription,
              ],
            }) as Hex,
          },
        ];

        // Execute both calls
        const factoryTxHash = await executeTransaction(registerCalls, userAddress as Address, proposalFeeMON);
        console.log('✅ Factory proposal registered (100 MON paid), TX:', factoryTxHash);

        const governorTxHash = await executeTransaction(governorProposeCalls, userAddress as Address);
        console.log('✅ Governor proposal created, TX:', governorTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: governorTxHash,
          factoryTxHash,
          action,
          userAddress,
          prompt: prompt.substring(0, 100),
          treasuryAllocation: allocationBps,
          feePaid: '100 MON',
          message: `Deployment proposal created! 100 MON fee paid (50 treasury + 50 platform). TOURS reward pending. Community voting begins soon.`,
        });
      }

      // ==================== DAO: VOTE ON PROPOSAL ====================
      case 'dao_vote_proposal': {
        console.log('🗳️ Action: dao_vote_proposal');
        const { proposalId: voteProposalId, support } = params || {};
        if (!voteProposalId) {
          return NextResponse.json(
            { success: false, error: 'Missing proposalId for vote' },
            { status: 400 }
          );
        }

        // support: 0 = Against, 1 = For, 2 = Abstain
        const voteSupport = Number(support ?? 1);
        if (![0, 1, 2].includes(voteSupport)) {
          return NextResponse.json(
            { success: false, error: 'Support must be 0 (Against), 1 (For), or 2 (Abstain)' },
            { status: 400 }
          );
        }

        const DAO_VOTE = process.env.NEXT_PUBLIC_DAO as Address;
        if (!DAO_VOTE) {
          return NextResponse.json(
            { success: false, error: 'DAO Governor not configured' },
            { status: 500 }
          );
        }

        const voteCalls: Call[] = [
          {
            to: DAO_VOTE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function castVote(uint256 proposalId, uint8 support) external returns (uint256)']),
              functionName: 'castVote',
              args: [BigInt(voteProposalId), voteSupport],
            }) as Hex,
          },
        ];

        const voteTxHash = await executeTransaction(voteCalls, userAddress as Address);
        console.log('✅ Vote cast, TX:', voteTxHash);

        const supportLabels = ['Against', 'For', 'Abstain'];
        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: voteTxHash,
          action,
          userAddress,
          proposalId: voteProposalId,
          support: supportLabels[voteSupport],
          message: `Voted "${supportLabels[voteSupport]}" on proposal!`,
        });
      }

      // ==================== DAO: QUEUE PROPOSAL IN TIMELOCK ====================
      case 'dao_queue_proposal': {
        console.log('🗳️ Action: dao_queue_proposal');
        const { targets, values, calldatas, descriptionHash } = params || {};
        if (!targets || !calldatas || !descriptionHash) {
          return NextResponse.json(
            { success: false, error: 'Missing targets, calldatas, or descriptionHash for queue' },
            { status: 400 }
          );
        }

        const DAO_QUEUE = process.env.NEXT_PUBLIC_DAO as Address;
        if (!DAO_QUEUE) {
          return NextResponse.json(
            { success: false, error: 'DAO Governor not configured' },
            { status: 500 }
          );
        }

        const queueCalls: Call[] = [
          {
            to: DAO_QUEUE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) external returns (uint256)'
              ]),
              functionName: 'queue',
              args: [
                targets.map((t: string) => t as Address),
                values.map((v: string) => BigInt(v)),
                calldatas.map((c: string) => c as Hex),
                descriptionHash as Hex,
              ],
            }) as Hex,
          },
        ];

        const queueTxHash = await executeTransaction(queueCalls, userAddress as Address);
        console.log('✅ Proposal queued in Timelock, TX:', queueTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: queueTxHash,
          action,
          userAddress,
          message: `Proposal queued in Timelock! Execution available after 2-day delay.`,
        });
      }

      // ==================== DAO: EXECUTE PROPOSAL AFTER TIMELOCK ====================
      case 'dao_execute_proposal': {
        console.log('🗳️ Action: dao_execute_proposal');
        const { targets: execTargets, values: execValues, calldatas: execCalldatas, descriptionHash: execDescHash } = params || {};
        if (!execTargets || !execCalldatas || !execDescHash) {
          return NextResponse.json(
            { success: false, error: 'Missing targets, calldatas, or descriptionHash for execute' },
            { status: 400 }
          );
        }

        const DAO_EXEC = process.env.NEXT_PUBLIC_DAO as Address;
        if (!DAO_EXEC) {
          return NextResponse.json(
            { success: false, error: 'DAO Governor not configured' },
            { status: 500 }
          );
        }

        const execCalls: Call[] = [
          {
            to: DAO_EXEC,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) external payable returns (uint256)'
              ]),
              functionName: 'execute',
              args: [
                execTargets.map((t: string) => t as Address),
                execValues.map((v: string) => BigInt(v)),
                execCalldatas.map((c: string) => c as Hex),
                execDescHash as Hex,
              ],
            }) as Hex,
          },
        ];

        const execTxHash = await executeTransaction(execCalls, userAddress as Address);
        console.log('✅ Proposal executed, TX:', execTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: execTxHash,
          action,
          userAddress,
          message: `Proposal executed! Contract deployed via DAO governance.`,
        });
      }

      // ==================== DAILY LOTTERY - BUY TICKETS (PYTH ENTROPY) ====================
      case 'daily_lottery_buy': {
        console.log('🎰 Action: daily_lottery_buy (Pyth Entropy)');

        const DAILY_LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as Address;
        const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;

        if (!DAILY_LOTTERY_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Daily lottery not configured' },
            { status: 500 }
          );
        }

        const ticketCount = params?.ticketCount || 1;
        // Contract requires userFid > 0, so ensure we have a valid value
        const rawFid = params?.fid || fid;
        const userFid = BigInt(rawFid && Number(rawFid) > 0 ? rawFid : 1);

        if (ticketCount < 1 || ticketCount > 100) {
          return NextResponse.json(
            { success: false, error: 'Ticket count must be between 1 and 100' },
            { status: 400 }
          );
        }

        // Read ticket price from contract
        let ticketPrice = parseEther('2'); // Fallback to 2 WMON
        const totalCost = ticketPrice * BigInt(ticketCount);

        console.log('🎰 Buying daily lottery tickets:', {
          ticketCount,
          totalCost: formatEther(totalCost) + ' WMON',
          beneficiary: userAddress,
          userFid: userFid.toString(),
        });

        // Platform Safe pays for tickets (custodial model - user already paid via Discord balance)
        // IMPORTANT: Always use Platform Safe here, NOT User Safe, because users pay via custodial deposit
        const dailyLotteryBuyCalls: Call[] = [
          // Step 1: Wrap MON to WMON
          {
            to: WMON_ADDRESS,
            value: totalCost,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          },
          // Step 2: Approve lottery to spend WMON
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [DAILY_LOTTERY_ADDRESS, totalCost],
            }) as Hex,
          },
          // Step 3: Buy tickets for user (beneficiary pattern)
          {
            to: DAILY_LOTTERY_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function buyTicketsFor(address beneficiary, uint256 userFid, uint256 ticketCount) external']),
              functionName: 'buyTicketsFor',
              args: [userAddress as Address, userFid, BigInt(ticketCount)],
            }) as Hex,
          },
        ];

        // Use Platform Safe directly (not User Safe) since this is custodial lottery
        console.log('🏢 Using PLATFORM Safe for custodial lottery purchase');
        const dailyLotteryBuyTxHash = await sendSafeTransaction(dailyLotteryBuyCalls);
        console.log('✅ Bought daily lottery tickets, TX:', dailyLotteryBuyTxHash);

        return NextResponse.json({
          success: true,
          txHash: dailyLotteryBuyTxHash,
          action,
          userAddress,
          ticketCount,
          totalCost: formatEther(totalCost),
          message: `Bought ${ticketCount} lottery ticket${ticketCount > 1 ? 's' : ''} for ${formatEther(totalCost)} WMON (gasless)`,
        });
      }

      // ==================== DAILY LOTTERY - REQUEST DRAW (PYTH ENTROPY) ====================
      case 'daily_lottery_draw': {
        console.log('🎲 Action: daily_lottery_draw (Pyth Entropy)');

        const DAILY_LOTTERY_DRAW_ADDRESS = process.env.NEXT_PUBLIC_DAILY_LOTTERY as Address;

        if (!DAILY_LOTTERY_DRAW_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Daily lottery not configured' },
            { status: 500 }
          );
        }

        // Query actual Pyth Entropy fee from the lottery contract (excess is refunded by contract)
        let entropyFee: bigint;
        try {
          const { createPublicClient, http } = await import('viem');
          const feeClient = createPublicClient({ transport: http(process.env.MONAD_RPC || 'https://rpc.monad.xyz') });
          const queriedFee = await feeClient.readContract({
            address: DAILY_LOTTERY_DRAW_ADDRESS,
            abi: parseAbi(['function getEntropyFee() view returns (uint256)']),
            functionName: 'getEntropyFee',
          }) as bigint;
          // Add 20% buffer to handle minor fee fluctuations; contract refunds excess
          entropyFee = (queriedFee * 120n) / 100n;
          console.log(`🎲 Pyth entropy fee: ${formatEther(queriedFee)} MON (sending ${formatEther(entropyFee)} MON with buffer)`);
        } catch {
          // Fallback to 1 MON if query fails — contract always refunds excess
          entropyFee = parseEther('1');
          console.warn('🎲 Could not query entropy fee, falling back to 1 MON');
        }

        console.log('🎲 Requesting daily lottery draw:', {
          lotteryAddress: DAILY_LOTTERY_DRAW_ADDRESS,
          entropyFee: formatEther(entropyFee) + ' MON',
          triggeredBy: userAddress,
        });

        // Request draw - caller gets 5-50 TOURS reward
        // Use Platform Safe since this pays the Pyth Entropy fee
        const dailyLotteryDrawCalls: Call[] = [
          {
            to: DAILY_LOTTERY_DRAW_ADDRESS,
            value: entropyFee,
            data: encodeFunctionData({
              abi: parseAbi(['function requestDraw() external payable']),
              functionName: 'requestDraw',
            }) as Hex,
          },
        ];

        console.log('🏢 Using PLATFORM Safe for lottery draw');
        const dailyLotteryDrawTxHash = await sendSafeTransaction(dailyLotteryDrawCalls);
        console.log('✅ Requested daily lottery draw, TX:', dailyLotteryDrawTxHash);

        return NextResponse.json({
          success: true,
          txHash: dailyLotteryDrawTxHash,
          action,
          userAddress,
          message: `Lottery draw requested! You'll receive 5-50 TOURS bonus for triggering the draw.`,
        });
      }

      // ==================== FLIP COIN GAME ====================
      case 'flip_coin': {
        console.log('🪙 Action: flip_coin (external game contract)');

        const FLIP_COIN_CONTRACT = '0xfE2ff247FCF671A59e69F1608E0A2eEda05139b4' as Address;

        // Get bet parameters
        const choice = params?.choice === 'heads' || params?.choice === true; // true = heads, false = tails
        const betAmountMon = params?.betAmount || '0.1'; // Default 0.1 MON

        // Validate bet amount
        const betAmountWei = parseEther(betAmountMon);
        const minBet = parseEther('0.0001'); // 0.0001 MON
        const maxBet = parseEther('100'); // 100 MON

        if (betAmountWei < minBet || betAmountWei > maxBet) {
          return NextResponse.json({
            success: false,
            error: `Bet amount must be between 0.0001 and 100 MON. You tried to bet ${betAmountMon} MON.`
          }, { status: 400 });
        }

        console.log('🪙 Flip coin game:', {
          choice: choice ? 'HEADS' : 'TAILS',
          betAmount: betAmountMon + ' MON',
          contract: FLIP_COIN_CONTRACT,
          player: userAddress,
        });

        // Call flip(bool choice) with value
        const flipCoinCalls: Call[] = [
          {
            to: FLIP_COIN_CONTRACT,
            value: betAmountWei,
            data: encodeFunctionData({
              abi: parseAbi(['function flip(bool choice) external payable returns (bool won, uint256 payout, bool resultWasHeads)']),
              functionName: 'flip',
              args: [choice],
            }) as Hex,
          },
        ];

        // Execute through User Safe (user pays from their Safe balance)
        const flipCoinTxHash = await executeTransaction(flipCoinCalls, userAddress as Address, betAmountWei);

        // Read the result by checking balance change
        // Note: We can't easily decode the return value, so we return the tx hash
        // and let the frontend parse the logs or check balance

        if (requiresDelegation) {
          await incrementTransactionCount(userAddress);
        }

        console.log('🪙 Flip coin tx sent:', flipCoinTxHash);

        return NextResponse.json({
          success: true,
          txHash: flipCoinTxHash,
          action,
          userAddress,
          choice: choice ? 'HEADS' : 'TAILS',
          betAmount: betAmountMon,
          message: `Coin flipped! You bet ${betAmountMon} MON on ${choice ? 'HEADS' : 'TAILS'}. Check tx for result.`,
        });
      }

      // ==================== EMPOWERSTUDIO AI ACTION PAYMENT ====================
      case 'studio_pay': {
        const STUDIO_PAYMENTS = process.env.NEXT_PUBLIC_STUDIO_PAYMENTS as Address;
        const WMON_STUDIO = process.env.NEXT_PUBLIC_WMON as Address;

        const { actionType } = params || {};
        if (actionType === undefined || actionType === null || actionType < 0 || actionType > 3) {
          return NextResponse.json(
            { success: false, error: 'Invalid action type (0=Stem, 1=Genre, 2=Vocal, 3=Freestyle)' },
            { status: 400 }
          );
        }

        const ACTION_NAMES = ['Stem Separation', 'Genre Transform', 'Vocal Synth', 'Freestyle'];
        console.log(`🎵 Studio payment: ${ACTION_NAMES[actionType]} (action=${actionType})`);

        // Read price from contract
        const { createPublicClient, http } = await import('viem');
        const studioClient = createPublicClient({
          chain: activeChain,
          transport: http(activeChain.rpcUrls.default.http[0]),
        });

        const priceWei = await studioClient.readContract({
          address: STUDIO_PAYMENTS,
          abi: parseAbi(['function actionPrice(uint8 action) view returns (uint256)']),
          functionName: 'actionPrice',
          args: [actionType],
        });

        console.log(`🎵 Price for ${ACTION_NAMES[actionType]}: ${formatEther(priceWei)} WMON`);

        // Check user Safe WMON balance
        const userSafeForStudio = await getUserSafeAddress(userAddress);
        const safeWmonStudio = await studioClient.readContract({
          address: WMON_STUDIO,
          abi: parseAbi(['function balanceOf(address account) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [userSafeForStudio],
        });

        const studioCalls: Call[] = [];

        // Wrap MON → WMON if needed
        if (safeWmonStudio < priceWei) {
          const wrapAmount = priceWei - safeWmonStudio;
          console.log(`🎵 Wrapping ${formatEther(wrapAmount)} MON → WMON`);
          studioCalls.push({
            to: WMON_STUDIO,
            value: wrapAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          });
        }

        // Approve WMON
        studioCalls.push({
          to: WMON_STUDIO,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
            functionName: 'approve',
            args: [STUDIO_PAYMENTS, priceWei],
          }) as Hex,
        });

        // payForAction
        studioCalls.push({
          to: STUDIO_PAYMENTS,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function payForAction(uint8 action) external']),
            functionName: 'payForAction',
            args: [actionType],
          }) as Hex,
        });

        const studioTxHash = await executeTransaction(studioCalls, userAddress as Address);
        console.log(`✅ Studio payment complete: ${ACTION_NAMES[actionType]}, TX: ${studioTxHash}`);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: studioTxHash,
          action,
          actionType,
          actionName: ACTION_NAMES[actionType],
          message: `Paid ${formatEther(priceWei)} WMON for ${ACTION_NAMES[actionType]}`,
        });
      }

      // ==================== EMPOWERSTUDIO MINT REMIX NFT ====================
      case 'studio_mint_remix': {
        const REMIX_DAW = process.env.NEXT_PUBLIC_REMIX_DAW as Address;
        const WMON_MINT = process.env.NEXT_PUBLIC_WMON as Address;

        const { originalTokenId, tokenURI: mintTokenURI, priceMon } = params || {};
        if (!originalTokenId || !mintTokenURI || !priceMon) {
          return NextResponse.json(
            { success: false, error: 'originalTokenId, tokenURI, and priceMon are required' },
            { status: 400 }
          );
        }

        const mintPriceWei = parseEther(priceMon);
        console.log(`🎵 Minting remix NFT: original=#${originalTokenId}, price=${priceMon} WMON`);

        const { createPublicClient, http } = await import('viem');
        const mintClient = createPublicClient({
          chain: activeChain,
          transport: http(activeChain.rpcUrls.default.http[0]),
        });

        // Check user Safe WMON balance
        const userSafeForMint = await getUserSafeAddress(userAddress);
        const safeWmonMint = await mintClient.readContract({
          address: WMON_MINT,
          abi: parseAbi(['function balanceOf(address account) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [userSafeForMint],
        });

        const mintCalls: Call[] = [];

        // Wrap MON → WMON if needed
        if (safeWmonMint < mintPriceWei) {
          const wrapAmount = mintPriceWei - safeWmonMint;
          console.log(`🎵 Wrapping ${formatEther(wrapAmount)} MON → WMON for mint`);
          mintCalls.push({
            to: WMON_MINT,
            value: wrapAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          });
        }

        // Approve WMON for RemixDAW
        mintCalls.push({
          to: WMON_MINT,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
            functionName: 'approve',
            args: [REMIX_DAW, mintPriceWei],
          }) as Hex,
        });

        // startSession
        mintCalls.push({
          to: REMIX_DAW,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function startSession(uint256 originalTokenId) external']),
            functionName: 'startSession',
            args: [BigInt(originalTokenId)],
          }) as Hex,
        });

        // mintRemix
        mintCalls.push({
          to: REMIX_DAW,
          value: 0n,
          data: encodeFunctionData({
            abi: parseAbi(['function mintRemix(uint256 originalTokenId, string tokenURI_, uint256 price) external returns (uint256)']),
            functionName: 'mintRemix',
            args: [BigInt(originalTokenId), mintTokenURI, mintPriceWei],
          }) as Hex,
        });

        const mintRemixTxHash = await executeTransaction(mintCalls, userAddress as Address);
        console.log(`✅ Remix NFT minted, TX: ${mintRemixTxHash}`);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintRemixTxHash,
          action,
          message: `Remix NFT minted for ${priceMon} WMON!`,
        });
      }

      // ==================== AI AGENT VAULTS ====================

      case 'vault_deposit': {
        console.log('🏦 Action: vault_deposit (AI Vault deposit WMON)');

        const VAULT = (process.env.VAULT_CONTRACT || '') as Address;
        const WMON_TOKEN = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;

        const { agentId: depositAgentId, amount: depositAmount } = params || {};

        if (depositAgentId == null || !depositAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: agentId, amount' },
            { status: 400 }
          );
        }

        const agentIdNum = Number(depositAgentId);
        if (isNaN(agentIdNum) || agentIdNum < 0 || agentIdNum > 7) {
          return NextResponse.json(
            { success: false, error: 'agentId must be 0-7' },
            { status: 400 }
          );
        }

        const depositWei = parseEther(depositAmount);
        if (depositWei <= 0n) {
          return NextResponse.json(
            { success: false, error: 'Amount must be greater than 0' },
            { status: 400 }
          );
        }

        console.log('🏦 Vault deposit:', { agentId: agentIdNum, amount: depositAmount, vault: VAULT });

        // Check WMON balance and auto-wrap MON if needed
        const { createPublicClient: createVaultClient, http: vaultHttp } = await import('viem');
        const { activeChain: vaultChain } = await import('@/app/chains');
        const vaultCheckClient = createVaultClient({
          chain: vaultChain,
          transport: vaultHttp(),
        });

        const depositSafeAddr = USE_USER_SAFES
          ? await getUserSafeAddress(userAddress as Address)
          : SAFE_ACCOUNT;

        const wmonBalForDeposit = await vaultCheckClient.readContract({
          address: WMON_TOKEN,
          abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [depositSafeAddr],
        }) as bigint;

        console.log('💰 Safe WMON balance:', (Number(wmonBalForDeposit) / 1e18).toFixed(4), 'WMON, need:', depositAmount, 'WMON');

        if (wmonBalForDeposit < depositWei) {
          const wmonNeededForDeposit = depositWei - wmonBalForDeposit;
          const wmonNeededStr = (Number(wmonNeededForDeposit) / 1e18).toFixed(4);
          console.log('🔄 AUTO-WRAP: Need to wrap', wmonNeededStr, 'MON to WMON before vault deposit');

          // Check MON balance
          const monBalForDeposit = await vaultCheckClient.getBalance({ address: depositSafeAddr });
          if (monBalForDeposit < wmonNeededForDeposit) {
            return NextResponse.json({
              success: false,
              error: `Insufficient funds. Need ${depositAmount} WMON but Safe has ${(Number(wmonBalForDeposit) / 1e18).toFixed(4)} WMON + ${(Number(monBalForDeposit) / 1e18).toFixed(2)} MON.`,
            }, { status: 400 });
          }

          // Execute wrap as separate UserOp
          console.log('💱 Wrapping', wmonNeededStr, 'MON to WMON...');
          const wrapDepositCalls: Call[] = [{
            to: WMON_TOKEN,
            value: wmonNeededForDeposit,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
            }) as Hex,
          }];

          const wrapDepositTxHash = await executeTransaction(wrapDepositCalls, userAddress as Address);
          console.log('✅ Wrap successful, TX:', wrapDepositTxHash);

          // Wait for state to propagate
          await new Promise(r => setTimeout(r, 2000));
        }

        // Two calls: 1) approve WMON, 2) deposit into vault
        const vaultDepositCalls: Call[] = [
          {
            to: WMON_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [VAULT, depositWei],
            }) as Hex,
          },
          {
            to: VAULT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit(uint8 agentId, uint256 amount, uint256 minSharesOut) external']),
              functionName: 'deposit',
              args: [agentIdNum, depositWei, 0n], // minSharesOut=0 for simplicity
            }) as Hex,
          },
        ];

        const vaultDepositTxHash = await executeTransaction(vaultDepositCalls, userAddress as Address);
        console.log('✅ Vault deposit TX:', vaultDepositTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: vaultDepositTxHash,
          action,
          agentId: agentIdNum,
          amount: depositAmount,
          message: `Deposited ${depositAmount} WMON into vault ${agentIdNum}!`,
        });
      }

      case 'vault_withdraw': {
        console.log('🏦 Action: vault_withdraw (AI Vault withdraw shares)');

        const VAULT = (process.env.VAULT_CONTRACT || '') as Address;
        const { agentId: withdrawAgentId, shares: sharesToBurn } = params || {};

        if (withdrawAgentId == null || !sharesToBurn) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: agentId, shares' },
            { status: 400 }
          );
        }

        const wAgentId = Number(withdrawAgentId);
        if (isNaN(wAgentId) || wAgentId < 0 || wAgentId > 7) {
          return NextResponse.json(
            { success: false, error: 'agentId must be 0-7' },
            { status: 400 }
          );
        }

        const sharesWei = parseEther(sharesToBurn);

        console.log('🏦 Vault withdraw:', { agentId: wAgentId, shares: sharesToBurn, vault: VAULT });

        const vaultWithdrawCalls: Call[] = [
          {
            to: VAULT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function withdraw(uint8 agentId, uint256 sharesToBurn, uint256 minAmountOut) external']),
              functionName: 'withdraw',
              args: [wAgentId, sharesWei, 0n], // minAmountOut=0 for simplicity
            }) as Hex,
          },
        ];

        const vaultWithdrawTxHash = await executeTransaction(vaultWithdrawCalls, userAddress as Address);
        console.log('✅ Vault withdraw TX:', vaultWithdrawTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: vaultWithdrawTxHash,
          action,
          agentId: wAgentId,
          shares: sharesToBurn,
          message: `Withdrew ${sharesToBurn} shares from vault ${wAgentId}!`,
        });
      }

      case 'vault_emergency_withdraw': {
        console.log('🚨 Action: vault_emergency_withdraw (AI Vault emergency)');

        const VAULT = (process.env.VAULT_CONTRACT || '') as Address;
        const { agentId: emergencyAgentId } = params || {};

        if (emergencyAgentId == null) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameter: agentId' },
            { status: 400 }
          );
        }

        const eAgentId = Number(emergencyAgentId);
        if (isNaN(eAgentId) || eAgentId < 0 || eAgentId > 7) {
          return NextResponse.json(
            { success: false, error: 'agentId must be 0-7' },
            { status: 400 }
          );
        }

        console.log('🚨 Vault emergency withdraw:', { agentId: eAgentId, vault: VAULT });

        const emergencyWithdrawCalls: Call[] = [
          {
            to: VAULT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function emergencyWithdraw(uint8 agentId) external']),
              functionName: 'emergencyWithdraw',
              args: [eAgentId],
            }) as Hex,
          },
        ];

        const emergencyTxHash = await executeTransaction(emergencyWithdrawCalls, userAddress as Address);
        console.log('✅ Emergency withdraw TX:', emergencyTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: emergencyTxHash,
          action,
          agentId: eAgentId,
          message: `Emergency withdrawal from vault ${eAgentId} complete!`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);

    // ✅ Enhanced error handling for common AA/bundler errors
    let userFriendlyError = error.message || 'Failed to execute action';
    let statusCode = 500;

    // ✅ Extract UserOperation hash if available (from timeout or other errors)
    const userOpHash = error.userOpHash;

    // Check for Pimlico reserve balance errors
    if (error.message?.includes('reserve balance') || error.message?.includes('Insufficient MON balance')) {
      statusCode = 503; // Service Unavailable - Safe needs funding
      userFriendlyError = error.message; // Already user-friendly
    }
    // Check for gas estimation errors
    else if (error.message?.includes('Gas estimation failed')) {
      statusCode = 400; // Bad Request - likely an invalid operation
      userFriendlyError = error.message; // Already detailed
    }
    // Check for insufficient token balance
    else if (error.message?.includes('Insufficient token balance') || error.message?.includes('Insufficient TOURS')) {
      statusCode = 400;
      userFriendlyError = error.message; // Already user-friendly
    }
    // Check for NFT ownership/whitelist errors
    else if (error.message?.includes('not whitelisted') || error.message?.includes('does not own NFT')) {
      statusCode = 400;
      userFriendlyError = error.message; // Already user-friendly
    }
    // ✅ Check for transaction timeout with UserOp hash
    else if (error.message?.includes('taking longer than expected') && userOpHash) {
      statusCode = 202; // Accepted - transaction is processing
      userFriendlyError = error.message; // Already includes userOpHash
    }

    const errorResponse: any = {
      success: false,
      error: userFriendlyError,
      action: 'execute_delegated',
    };

    // ✅ Include UserOp hash in response if available so users can track their transaction
    if (userOpHash) {
      errorResponse.userOpHash = userOpHash;
      console.log('📋 Including UserOperation hash in error response:', userOpHash);
    }

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
