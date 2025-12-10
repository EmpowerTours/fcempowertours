import {
  EmpowerToursNFT,
  PassportNFT,
  ExperienceNFT,
  YieldStrategy,
  DemandSignalEngine,
  SmartEventManifest,
  TandaYieldGroup,
  CreditScoreCalculator,
  DailyPassLotteryV3,
  MusicBeatMatchV2,
  CountryCollectorV2,
} from "generated";

// ✅ Type definition for metadata
interface MusicMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
}

// ✅ IMPROVED: Multiple gateway fallbacks
const GATEWAYS = [
  "harlequin-used-hare-224.mypinata.cloud",
  "gateway.pinata.cloud",
  "ipfs.io",
  "dweb.link",
];

function resolveIPFS(url: string, gatewayIndex: number = 0): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    const gateway = GATEWAYS[gatewayIndex] || GATEWAYS[0];
    return url.replace("ipfs://", `https://${gateway}/ipfs/`);
  }
  return url;
}

// ✅ IMPROVED: Fetch metadata with retry and multiple gateways
async function fetchMetadata(tokenURI: string, context: any): Promise<{
  name: string;
  description: string;
  imageUrl: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
} | null> {
  
  // Try each gateway in sequence
  for (let gatewayIndex = 0; gatewayIndex < GATEWAYS.length; gatewayIndex++) {
    try {
      const metadataUrl = resolveIPFS(tokenURI, gatewayIndex);
      const gateway = GATEWAYS[gatewayIndex];
      
      context.log.info(`📦 [Gateway ${gatewayIndex + 1}/${GATEWAYS.length}] Fetching from ${gateway}...`);
      context.log.info(`   URL: ${metadataUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(metadataUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        context.log.warn(`⚠️ Gateway ${gateway} returned HTTP ${response.status}`);
        continue; // Try next gateway
      }
      
      const metadata = await response.json() as MusicMetadata;
      
      context.log.info(`✅ Metadata fetched from ${gateway}:`, {
        name: metadata.name,
        hasImage: !!metadata.image,
        hasAnimationUrl: !!metadata.animation_url,
        hasExternalUrl: !!metadata.external_url,
      });
      
      // ✅ CRITICAL: Log the raw URLs before resolving
      context.log.info(`📝 Raw metadata URLs:`, {
        image: metadata.image,
        animation_url: metadata.animation_url,
        external_url: metadata.external_url,
      });
      
      const result = {
        name: metadata.name || "",
        description: metadata.description || "",
        imageUrl: resolveIPFS(metadata.image || "", gatewayIndex),
        previewAudioUrl: resolveIPFS(metadata.animation_url || "", gatewayIndex),
        fullAudioUrl: resolveIPFS(metadata.external_url || metadata.animation_url || "", gatewayIndex),
      };
      
      // ✅ CRITICAL: Log the resolved URLs
      context.log.info(`🔗 Resolved URLs:`, result);
      
      return result;
      
    } catch (error: any) {
      context.log.warn(`❌ Gateway ${GATEWAYS[gatewayIndex]} failed: ${error.message}`);
      if (error.name === 'AbortError') {
        context.log.warn(`   Timeout after 15 seconds`);
      }
      // Continue to next gateway
    }
  }
  
  // All gateways failed
  context.log.error(`❌ All gateways failed to fetch metadata for: ${tokenURI}`);
  return null;
}

// ============================================
// EMPOWER TOURS NFT EVENTS
// ============================================

EmpowerToursNFT.MasterMinted.handler(async ({ event, context }) => {
  const { tokenId, artist, tokenURI, price, nftType } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;

  // ✅ V6: Use nftType from event (0 = Music, 1 = Art)
  const isArt = nftType === BigInt(1);

  context.log.info(`🎵 Processing MasterMinted event for tokenId ${tokenId}`);
  context.log.info(`   Artist: ${artist}`);
  context.log.info(`   TokenURI: ${tokenURI}`);
  context.log.info(`   Price: ${price.toString()}`);
  context.log.info(`   NFT Type: ${isArt ? 'Art' : 'Music'} (${nftType})`);

  // ✅ Fetch metadata during indexing
  const metadata = await fetchMetadata(tokenURI, context);

  if (!metadata) {
    context.log.error(`❌ Failed to fetch metadata for Music NFT #${tokenId}`);
    context.log.error(`   TokenURI: ${tokenURI}`);
    context.log.error(`   This NFT will have empty audio URLs!`);
  }

  const musicNFT = {
    id: musicNFTId,
    tokenId: tokenId.toString(),
    contract: event.srcAddress.toLowerCase(),
    artist: artist.toLowerCase(),
    owner: artist.toLowerCase(),
    tokenURI: tokenURI, // ✅ CORRECT: Preserves original case
    price: price,
    totalSold: 0,
    active: true,
    coverArt: "",
    royaltyPercentage: 10,

    // ✅ Store metadata fields (with fallbacks)
    name: metadata?.name || `Music NFT #${tokenId}`,
    description: metadata?.description || "",
    imageUrl: metadata?.imageUrl || "",
    previewAudioUrl: metadata?.previewAudioUrl || "",
    fullAudioUrl: metadata?.fullAudioUrl || "",
    metadataFetched: !!metadata,
    isArt: isArt,

    // ✅ V5: Initialize staking & burning fields
    isStaked: false,
    stakedAt: BigInt(0),
    staker: "",
    isBurned: false,
    burnedAt: BigInt(0),

    mintedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  context.log.info(`💾 Storing Music NFT with data:`, {
    id: musicNFT.id,
    name: musicNFT.name,
    previewAudioUrl: musicNFT.previewAudioUrl,
    fullAudioUrl: musicNFT.fullAudioUrl,
    metadataFetched: musicNFT.metadataFetched,
    isArt: musicNFT.isArt,
  });

  await context.MusicNFT.set(musicNFT);

  const userId = artist.toLowerCase();
  let userStats = await context.UserStats.get(userId);

  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      musicNFTCount: isArt ? userStats.musicNFTCount : userStats.musicNFTCount + 1,
      artNFTCount: isArt ? userStats.artNFTCount + 1 : userStats.artNFTCount,
      totalNFTs: userStats.totalNFTs + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: artist.toLowerCase(),
      musicNFTCount: isArt ? 0 : 1,
      artNFTCount: isArt ? 1 : 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      experiencesCreated: 0,
      experiencesPurchased: 0,
      totalNFTs: 1,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalMusicNFTs: globalStats.totalMusicNFTs + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 1,
      totalPassports: 0,
      totalItineraries: 0,
      totalItineraryPurchases: 0,
      totalExperiences: 0,
      totalExperiencePurchases: 0,
      totalMusicLicensesPurchased: 0,
      totalStaked: BigInt(0),
      totalStakers: 0,
      totalEvents: 0,
      totalTicketsSold: 0,
      totalTandaGroups: 0,
      totalDemandSignals: 0,
      totalLotteryRounds: 0,
      totalLotteryEntries: 0,
      totalLotteryPrizePool: BigInt(0),
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`✅ Music NFT #${tokenId} minted by ${artist} - "${metadata?.name || 'Untitled'}"`);
});

// ✅ Handle LicensePurchased event with createdAt field
EmpowerToursNFT.LicensePurchased.handler(async ({ event, context }) => {
  const { licenseId, masterTokenId, buyer, expiry } = event.params;

  const musicNFTId = `music-${event.chainId}-${masterTokenId.toString()}`;
  const musicLicenseId = `license-${event.chainId}-${licenseId.toString()}`;

  // ✅ VALIDATION: Ensure expiry is in the future
  if (Number(expiry) <= event.block.timestamp) {
    context.log.warn(
      `⚠️ License #${licenseId} has expiry in the past (${new Date(Number(expiry) * 1000).toISOString()}). Skipping.`
    );
    return;
  }

  const timestamp = new Date(event.block.timestamp * 1000);

  // Create MusicLicense entity
  const musicLicense = {
    id: musicLicenseId,
    licenseId: licenseId.toString(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: musicNFTId,
    licensee: buyer.toLowerCase(),
    expiry: BigInt(expiry),
    active: true,
    purchasedAt: timestamp,
    createdAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.MusicLicense.set(musicLicense);

  // Update MusicNFT totalSold count
  const musicNFT = await context.MusicNFT.get(musicNFTId);
  if (musicNFT) {
    await context.MusicNFT.set({
      ...musicNFT,
      totalSold: (musicNFT.totalSold || 0) + 1,
    });
  }

  // Update buyer stats
  const buyerId = buyer.toLowerCase();
  let buyerStats = await context.UserStats.get(buyerId);

  const isNewUser = !buyerStats;

  if (buyerStats) {
    await context.UserStats.set({
      ...buyerStats,
      licensesOwned: (buyerStats.licensesOwned || 0) + 1,
      lastActive: timestamp,
    });
  } else {
    await context.UserStats.set({
      id: buyerId,
      address: buyer.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      experiencesCreated: 0,
      experiencesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 1,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      lastActive: timestamp,
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalMusicLicensesPurchased: globalStats.totalMusicLicensesPurchased + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: timestamp,
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 0,
      totalPassports: 0,
      totalItineraries: 0,
      totalItineraryPurchases: 0,
      totalExperiences: 0,
      totalExperiencePurchases: 0,
      totalMusicLicensesPurchased: 1,
      totalStaked: BigInt(0),
      totalStakers: 0,
      totalEvents: 0,
      totalTicketsSold: 0,
      totalTandaGroups: 0,
      totalDemandSignals: 0,
      totalLotteryRounds: 0,
      totalLotteryEntries: 0,
      totalLotteryPrizePool: BigInt(0),
      totalUsers: 1,
      lastUpdated: timestamp,
    });
  }

  context.log.info(
    `💳 License #${licenseId} purchased for Music NFT #${masterTokenId} by ${buyer} - Expires: ${new Date(Number(expiry) * 1000).toISOString()}`
  );
});

// ✅ Handle LicenseExpired event
EmpowerToursNFT.LicenseExpired.handler(async ({ event, context }) => {
  const { licenseId } = event.params;

  const musicLicenseId = `license-${event.chainId}-${licenseId.toString()}`;
  const musicLicense = await context.MusicLicense.get(musicLicenseId);

  if (musicLicense) {
    await context.MusicLicense.set({
      ...musicLicense,
      active: false,
    });
    context.log.info(`⏰ License #${licenseId} expired`);
  }
});

EmpowerToursNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  if (from === "0x0000000000000000000000000000000000000000") {
    return;
  }

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    await context.MusicNFT.set({
      ...musicNFT,
      owner: to.toLowerCase(),
    });
    context.log.info(`🎵 Music NFT #${tokenId} transferred from ${from} to ${to}`);
  }
});

// ============================================
// MUSIC NFT V5: STAKING & BURNING EVENTS
// ============================================

EmpowerToursNFT.NFTStaked.handler(async ({ event, context }) => {
  const { tokenId, staker, timestamp } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    await context.MusicNFT.set({
      ...musicNFT,
      isStaked: true,
      stakedAt: timestamp,
      staker: staker.toLowerCase(),
    });
    context.log.info(`🎵 Music NFT #${tokenId} staked by ${staker}`);
  }
});

EmpowerToursNFT.NFTUnstaked.handler(async ({ event, context }) => {
  const { tokenId, staker, rewardsClaimed, timestamp } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    await context.MusicNFT.set({
      ...musicNFT,
      isStaked: false,
      stakedAt: BigInt(0),
      staker: "",
    });
    context.log.info(`🎵 Music NFT #${tokenId} unstaked by ${staker}, rewards: ${rewardsClaimed}`);
  }
});

EmpowerToursNFT.RewardsClaimed.handler(async ({ event, context }) => {
  const { tokenId, staker, amount, timestamp } = event.params;

  context.log.info(`💰 Music NFT #${tokenId} rewards claimed by ${staker}: ${amount} TOURS`);
});

EmpowerToursNFT.NFTBurned.handler(async ({ event, context }) => {
  const { tokenId, burner, rewardReceived, timestamp } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    // Mark NFT as burned
    await context.MusicNFT.set({
      ...musicNFT,
      isBurned: true,
      burnedAt: timestamp,
    });

    // Update user stats - decrement NFT counts
    const userId = musicNFT.owner.toLowerCase();
    let userStats = await context.UserStats.get(userId);

    if (userStats) {
      await context.UserStats.set({
        ...userStats,
        musicNFTCount: musicNFT.isArt ? userStats.musicNFTCount : Math.max(0, userStats.musicNFTCount - 1),
        artNFTCount: musicNFT.isArt ? Math.max(0, userStats.artNFTCount - 1) : userStats.artNFTCount,
        totalNFTs: Math.max(0, userStats.totalNFTs - 1),
        lastActive: new Date(event.block.timestamp * 1000),
      });
      context.log.info(`📊 Updated UserStats for ${userId} - ${musicNFT.isArt ? 'Art' : 'Music'} NFT count decremented`);
    }

    context.log.info(`🔥 Music NFT #${tokenId} burned by ${burner}, reward: ${rewardReceived} TOURS`);
  }
});

EmpowerToursNFT.BurnRewardUpdated.handler(async ({ event, context }) => {
  const { newReward, timestamp } = event.params;

  context.log.info(`🔥 Burn reward updated to ${newReward} TOURS at ${timestamp}`);
});

EmpowerToursNFT.RewardRateUpdated.handler(async ({ event, context }) => {
  const { newRate, timestamp } = event.params;

  context.log.info(`💰 Staking reward rate updated to ${newRate} TOURS/day at ${timestamp}`);
});

// ============================================
// PASSPORT NFT EVENTS
// ============================================

PassportNFT.PassportMinted.handler(async ({ event, context }) => {
  const { tokenId, owner, countryCode, countryName, region, continent } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

  // ✅ CRITICAL FIX: Normalize countryCode to uppercase for consistency
  const normalizedCountryCode = countryCode.toUpperCase();

  // ✅ VALIDATION: Ensure countryCode is valid
  if (!normalizedCountryCode || normalizedCountryCode.length !== 2) {
    context.log.error(
      `❌ Invalid countryCode for passport #${tokenId}: "${countryCode}" (normalized: "${normalizedCountryCode}")`
    );
  }

  const passportNFT = {
    id: passportNFTId,
    tokenId: tokenId.toString(),
    contract: event.srcAddress.toLowerCase(),
    owner: owner.toLowerCase(),
    countryCode: normalizedCountryCode, // ✅ FIX: Store as uppercase
    countryName: countryName,
    region: region,
    continent: continent,
    tokenURI: "",
    stakedAmount: BigInt(0),
    stampCount: 0,
    verifiedStampCount: 0,
    creditScore: 100, // Base credit score
    mintedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.PassportNFT.set(passportNFT);

  const userId = owner.toLowerCase();
  let userStats = await context.UserStats.get(userId);

  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      passportNFTCount: userStats.passportNFTCount + 1,
      totalNFTs: userStats.totalNFTs + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: owner.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 1,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      experiencesCreated: 0,
      experiencesPurchased: 0,
      totalNFTs: 1,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalPassports: globalStats.totalPassports + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 0,
      totalPassports: 1,
      totalItineraries: 0,
      totalItineraryPurchases: 0,
      totalExperiences: 0,
      totalExperiencePurchases: 0,
      totalMusicLicensesPurchased: 0,
      totalStaked: BigInt(0),
      totalStakers: 0,
      totalEvents: 0,
      totalTicketsSold: 0,
      totalTandaGroups: 0,
      totalDemandSignals: 0,
      totalLotteryRounds: 0,
      totalLotteryEntries: 0,
      totalLotteryPrizePool: BigInt(0),
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(
    `🎫 Passport NFT #${tokenId} minted for ${owner} - ${normalizedCountryCode} ${countryName} (${region}, ${continent})`
  );
});

PassportNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  if (from === "0x0000000000000000000000000000000000000000") {
    return;
  }

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const passportNFT = await context.PassportNFT.get(passportNFTId);

  if (passportNFT) {
    await context.PassportNFT.set({
      ...passportNFT,
      owner: to.toLowerCase(),
    });
    context.log.info(`🎫 Passport NFT #${tokenId} transferred from ${from} to ${to}`);
  }
});

// ✅ NEW: PassportNFTv2 staking handler
PassportNFT.PassportStaked.handler(async ({ event, context }) => {
  const { tokenId, monAmount, positionId } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const passportStakeId = `passport-stake-${event.block.number}-${event.logIndex}`;

  // Create passport stake event
  const passportStake = {
    id: passportStakeId,
    passport_id: passportNFTId,
    tokenId: tokenId.toString(),
    amount: monAmount,
    positionId: positionId,
    stakedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.PassportStake.set(passportStake);

  // Update passport staked amount and credit score
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const newStakedAmount = passportNFT.stakedAmount + monAmount;
    const stakedUnits = Number(newStakedAmount) / 1e18;
    const stampBonus = passportNFT.stampCount * 10;
    const verifiedBonus = passportNFT.verifiedStampCount * 5;
    const newCreditScore = 100 + Math.floor(stakedUnits) + stampBonus + verifiedBonus;

    await context.PassportNFT.set({
      ...passportNFT,
      stakedAmount: newStakedAmount,
      creditScore: newCreditScore,
    });

    context.log.info(`💰 Passport #${tokenId} staked ${monAmount.toString()} MON (position: ${positionId.toString()}). New credit score: ${newCreditScore}`);
  }
});

// ✅ NEW: Venue stamp handler
PassportNFT.VenueStampAdded.handler(async ({ event, context }) => {
  const { tokenId, location, eventType, timestamp } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const venueStampId = `venue-stamp-${event.block.number}-${event.logIndex}`;

  // Create venue stamp
  const venueStamp = {
    id: venueStampId,
    passport_id: passportNFTId,
    tokenId: tokenId.toString(),
    location: location,
    eventType: eventType,
    artist: undefined,
    timestamp: timestamp,
    verified: false, // Default to false, can be updated later
    addedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.VenueStamp.set(venueStamp);

  // Update passport stamp count and credit score
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const newStampCount = passportNFT.stampCount + 1;
    const stakedUnits = Number(passportNFT.stakedAmount) / 1e18;
    const stampBonus = newStampCount * 10;
    const verifiedBonus = passportNFT.verifiedStampCount * 5;
    const newCreditScore = 100 + Math.floor(stakedUnits) + stampBonus + verifiedBonus;

    await context.PassportNFT.set({
      ...passportNFT,
      stampCount: newStampCount,
      creditScore: newCreditScore,
    });

    context.log.info(`🎟️ Venue stamp added to Passport #${tokenId}: ${location} - ${eventType}. New credit score: ${newCreditScore}`);
  }
});

// ============================================
// MARKETPLACE/ITINERARY EVENTS
// ============================================
// NOTE: ItineraryNFT/ExperienceNFT events are handled by ExperienceNFT contract

// ============================================
// EXPERIENCE NFT EVENTS (GPS-gated travel experiences)
// ============================================

ExperienceNFT.ExperienceCreated.handler(async ({ event, context }) => {
  const { experienceId, creator, title, city, country, price } = event.params;

  const experienceEntityId = `experience-${event.chainId}-${experienceId.toString()}`;
  const userId = creator.toLowerCase();

  // Create experience entity
  const experience = {
    id: experienceEntityId,
    experienceId: experienceId.toString(),
    creator: userId,
    title: title,
    city: city,
    country: country,
    price: price,
    active: true,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.Experience.set(experience);

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      experiencesCreated: userStats.experiencesCreated + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: creator.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      experiencesCreated: 1,
      experiencesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalExperiences: globalStats.totalExperiences + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🗺️ Experience #${experienceId} created: "${title}" in ${city}, ${country} by ${creator}`);

  // ✅ Announce on Farcaster
  try {
    const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
    const priceInWmon = (Number(price) / 1e18).toFixed(2);

    const response = await fetch(`${appUrl}/api/cast-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'experience_created',
        experienceId: experienceId.toString(),
        title: title,
        city: city,
        country: country,
        price: priceInWmon,
        txHash: event.transaction.hash,
        creatorAddress: creator,
        fid: undefined, // Will be looked up by address if available
      }),
    });

    if (response.ok) {
      const result = await response.json() as any;
      context.log.info(`📢 Experience creation announced on Farcaster: ${result.castHash}`);
    } else {
      context.log.warn(`⚠️ Failed to announce experience creation on Farcaster`);
    }
  } catch (error: any) {
    context.log.warn(`⚠️ Error announcing experience creation: ${error.message}`);
  }
});

ExperienceNFT.ExperiencePurchased.handler(async ({ event, context }) => {
  const { experienceId, buyer, price } = event.params;

  const experienceEntityId = `experience-${event.chainId}-${experienceId.toString()}`;
  const purchaseId = `experience-purchase-${event.block.number}-${event.logIndex}`;
  const userId = buyer.toLowerCase();

  // Create purchase entity
  const purchase = {
    id: purchaseId,
    experience_id: experienceEntityId,
    experienceId: experienceId.toString(),
    buyer: userId,
    price: price,
    purchasedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.ExperiencePurchase.set(purchase);

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      experiencesPurchased: userStats.experiencesPurchased + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: buyer.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      experiencesCreated: 0,
      experiencesPurchased: 1,
      totalNFTs: 0,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalExperiencePurchases: globalStats.totalExperiencePurchases + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🛒 Experience #${experienceId} purchased by ${buyer} for ${price.toString()}`);

  // ✅ Get experience details for announcement
  const experience = await context.Experience.get(experienceEntityId);

  if (experience) {
    // ✅ Announce on Farcaster
    try {
      const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
      const priceInWmon = (Number(price) / 1e18).toFixed(2);

      const response = await fetch(`${appUrl}/api/cast-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'experience_purchased',
          experienceId: experienceId.toString(),
          title: experience.title,
          city: experience.city,
          country: experience.country,
          price: priceInWmon,
          txHash: event.transaction.hash,
          buyerAddress: buyer,
          fid: undefined, // Will be looked up by address if available
        }),
      });

      if (response.ok) {
        const result = await response.json() as any;
        context.log.info(`📢 Experience purchase announced on Farcaster: ${result.castHash}`);
      } else {
        context.log.warn(`⚠️ Failed to announce experience purchase on Farcaster`);
      }
    } catch (error: any) {
      context.log.warn(`⚠️ Error announcing experience purchase: ${error.message}`);
    }
  }
});

ExperienceNFT.ExperienceCompleted.handler(async ({ event, context }) => {
  const { experienceId, user, photoProofHash, rewardAmount } = event.params;

  const experienceEntityId = `experience-${event.chainId}-${experienceId.toString()}`;
  const completionId = `experience-completion-${event.block.number}-${event.logIndex}`;
  const userId = user.toLowerCase();

  // Create completion entity
  const completion = {
    id: completionId,
    experience_id: experienceEntityId,
    experienceId: experienceId.toString(),
    user: userId,
    photoProofHash: photoProofHash,
    rewardAmount: rewardAmount,
    completedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.ExperienceCompletion.set(completion);

  context.log.info(`✅ Experience #${experienceId} completed by ${user} - Reward: ${rewardAmount.toString()} TOURS`);
});

ExperienceNFT.TransportationRequested.handler(async ({ event, context }) => {
  const { experienceId, user, fromLat, fromLon, toLat, toLon } = event.params;

  const transportRequestId = `transport-request-${event.block.number}-${event.logIndex}`;
  const userId = user.toLowerCase();

  // Create transportation request entity
  const transportRequest = {
    id: transportRequestId,
    experienceId: experienceId.toString(),
    user: userId,
    fromLat: fromLat,
    fromLon: fromLon,
    toLat: toLat,
    toLon: toLon,
    requestedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TransportationRequest.set(transportRequest);

  context.log.info(`🚗 Transportation requested for Experience #${experienceId} by ${user}`);
});

// ============================================
// YIELD STRATEGY V9 (NFT-GATED STAKING WITH KINTSU)
// ============================================

YieldStrategy.StakingPositionCreated.handler(async ({ event, context }) => {
  // V9: Uses monAmount and kintsuShares (Kintsu vault integration)
  const { positionId, nftAddress, nftTokenId, owner, beneficiary, monAmount, kintsuShares, timestamp } = event.params;

  const stakingPositionId = positionId.toString();
  const beneficiaryId = beneficiary.toLowerCase();

  // Create staking position
  const stakingPosition = {
    id: stakingPositionId,
    positionId: stakingPositionId,
    nftAddress: nftAddress.toLowerCase(),
    nftTokenId: nftTokenId.toString(),
    owner: owner.toLowerCase(),
    beneficiary: beneficiaryId,
    toursAmount: monAmount, // V8 uses MON instead of TOURS
    monAmount: monAmount,
    active: true,
    createdAt: new Date(Number(timestamp) * 1000),
    closedAt: undefined,
    toursRefund: undefined,
    yieldShare: undefined,
    createdTxHash: event.transaction.hash,
    closedTxHash: undefined,
    createdBlockNumber: BigInt(event.block.number),
    closedBlockNumber: undefined,
  };

  await context.StakingPosition.set(stakingPosition);

  // Update user staking stats
  let userStakingStats = await context.UserStakingStats.get(beneficiaryId);

  if (userStakingStats) {
    await context.UserStakingStats.set({
      ...userStakingStats,
      activePositions: userStakingStats.activePositions + 1,
      totalPositionsCreated: userStakingStats.totalPositionsCreated + 1,
      totalToursStaked: userStakingStats.totalToursStaked + monAmount,
      lastStakeTime: new Date(Number(timestamp) * 1000),
    });
  } else {
    await context.UserStakingStats.set({
      id: beneficiaryId,
      user: beneficiaryId,
      activePositions: 1,
      totalPositionsCreated: 1,
      totalPositionsClosed: 0,
      totalToursStaked: monAmount,
      totalYieldEarned: BigInt(0),
      lastStakeTime: new Date(Number(timestamp) * 1000),
      lastWithdrawTime: undefined,
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    const isNewStaker = !userStakingStats;
    await context.GlobalStats.set({
      ...globalStats,
      totalStaked: (globalStats.totalStaked || BigInt(0)) + monAmount,
      totalStakers: isNewStaker ? (globalStats.totalStakers || 0) + 1 : (globalStats.totalStakers || 0),
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`💰 Staking position #${positionId} created for ${beneficiary} - ${monAmount.toString()} MON (${kintsuShares.toString()} Kintsu shares) (NFT: ${nftAddress}#${nftTokenId})`);
});

YieldStrategy.StakingPositionClosed.handler(async ({ event, context }) => {
  // V9: user, monRedeemed, yieldShare, netRefund (Kintsu redemption with fees)
  const { positionId, user, monRedeemed, yieldShare, netRefund, timestamp } = event.params;

  const stakingPositionId = positionId.toString();
  const userId = user.toLowerCase();

  // Update staking position
  const stakingPosition = await context.StakingPosition.get(stakingPositionId);

  if (stakingPosition) {
    await context.StakingPosition.set({
      ...stakingPosition,
      active: false,
      closedAt: new Date(Number(timestamp) * 1000),
      toursRefund: monRedeemed, // V9: Store monRedeemed as toursRefund
      yieldShare: yieldShare,
      closedTxHash: event.transaction.hash,
      closedBlockNumber: BigInt(event.block.number),
    });

    // Update user staking stats
    let userStakingStats = await context.UserStakingStats.get(userId);

    if (userStakingStats) {
      await context.UserStakingStats.set({
        ...userStakingStats,
        activePositions: userStakingStats.activePositions > 0 ? userStakingStats.activePositions - 1 : 0,
        totalPositionsClosed: userStakingStats.totalPositionsClosed + 1,
        totalYieldEarned: userStakingStats.totalYieldEarned + yieldShare,
        lastWithdrawTime: new Date(Number(timestamp) * 1000),
      });
    }

    // Update global stats
    let globalStats = await context.GlobalStats.get("global");
    if (globalStats) {
      const newGlobalStaked = (globalStats.totalStaked || BigInt(0)) - stakingPosition.toursAmount;
      await context.GlobalStats.set({
        ...globalStats,
        totalStaked: newGlobalStaked >= BigInt(0) ? newGlobalStaked : BigInt(0),
        lastUpdated: new Date(event.block.timestamp * 1000),
      });
    }

    context.log.info(`💸 Staking position #${positionId} closed for ${user} - MON Redeemed: ${monRedeemed.toString()}, Yield: ${yieldShare.toString()}, Net Refund: ${netRefund.toString()}`);
  }
});

// V9 NEW: Unstake request tracking
YieldStrategy.UnstakeRequested.handler(async ({ event, context }) => {
  const { positionId, user, shares, expectedSpotValue, estimatedReadyTime, timestamp } = event.params;

  context.log.info(`⏳ Unstake requested for position #${positionId} by ${user} - ${shares.toString()} Kintsu shares (est. ${expectedSpotValue.toString()} MON)`);
});

// V9 NEW: Unstake cancellation
YieldStrategy.UnstakeCancelled.handler(async ({ event, context }) => {
  const { positionId, user, sharesReturned, timestamp } = event.params;

  context.log.info(`🔄 Unstake cancelled for position #${positionId} by ${user} - ${sharesReturned.toString()} shares returned`);
});

YieldStrategy.NFTWhitelisted.handler(async ({ event, context }) => {
  const { nftAddress, accepted } = event.params;

  const whitelistEventId = `whitelist-${event.block.number}-${event.logIndex}`;

  // Create NFT whitelist event
  const nftWhitelistEvent = {
    id: whitelistEventId,
    nftAddress: nftAddress.toLowerCase(),
    accepted: accepted,
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.NFTWhitelistEvent.set(nftWhitelistEvent);

  context.log.info(`${accepted ? '✅' : '❌'} NFT ${nftAddress} ${accepted ? 'whitelisted' : 'removed from whitelist'}`);
});

YieldStrategy.YieldHarvested.handler(async ({ event, context }) => {
  // V9: Simplified - just yieldMon and currentValue
  const { yieldMon, currentValue, timestamp } = event.params;

  context.log.info(`🌾 Yield harvested - ${yieldMon.toString()} MON (current value: ${currentValue.toString()} MON)`);
});

// ============================================
// DEMAND SIGNAL ENGINE EVENTS
// ============================================

DemandSignalEngine.DemandSubmitted.handler(async ({ event, context }) => {
  const { user, eventId, amount } = event.params;

  const demandSignalId = `demand-${event.chainId}-${eventId.toString()}-${user.toLowerCase()}-${event.block.number}`;
  const userId = user.toLowerCase();
  const eventIdStr = eventId.toString();

  // Create demand signal
  const demandSignal = {
    id: demandSignalId,
    eventId: eventIdStr,
    user: userId,
    amount: amount,
    active: true,
    submittedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.DemandSignal.set(demandSignal);

  // Update event demand stats
  let eventStats = await context.EventDemandStats.get(eventIdStr);
  if (eventStats) {
    await context.EventDemandStats.set({
      ...eventStats,
      totalDemand: eventStats.totalDemand + amount,
      signalCount: eventStats.signalCount + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.EventDemandStats.set({
      id: eventIdStr,
      eventId: eventIdStr,
      totalDemand: amount,
      signalCount: 1,
      uniqueUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalDemandSignals: (globalStats.totalDemandSignals || 0) + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`📊 User ${user} submitted ${amount.toString()} demand for event #${eventId}`);
});

DemandSignalEngine.DemandWithdrawn.handler(async ({ event, context }) => {
  const { user, eventId, amount } = event.params;

  const userId = user.toLowerCase();
  const eventIdStr = eventId.toString();

  // Update event demand stats
  let eventStats = await context.EventDemandStats.get(eventIdStr);
  if (eventStats) {
    const newTotalDemand = eventStats.totalDemand - amount;
    await context.EventDemandStats.set({
      ...eventStats,
      totalDemand: newTotalDemand >= BigInt(0) ? newTotalDemand : BigInt(0),
      signalCount: eventStats.signalCount > 0 ? eventStats.signalCount - 1 : 0,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`📉 User ${user} withdrew ${amount.toString()} demand from event #${eventId}`);
});

// ============================================
// SMART EVENT MANIFEST EVENTS
// ============================================

SmartEventManifest.EventCreated.handler(async ({ event, context }) => {
  const { eventId, name, location, startDate } = event.params;

  const smartEventId = `event-${event.chainId}-${eventId.toString()}`;

  // Create smart event
  const smartEvent = {
    id: smartEventId,
    eventId: eventId.toString(),
    name: name,
    location: location,
    startDate: startDate,
    endDate: undefined,
    capacity: BigInt(1000), // Default capacity
    ticketsSold: 0,
    price: BigInt(0),
    active: true,
    cancelled: false,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.SmartEvent.set(smartEvent);

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalEvents: (globalStats.totalEvents || 0) + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎉 Event #${eventId} created: ${name} at ${location} on ${new Date(Number(startDate) * 1000).toISOString()}`);
});

SmartEventManifest.TicketPurchased.handler(async ({ event, context }) => {
  const { eventId, buyer, quantity } = event.params;

  const ticketId = `ticket-${event.block.number}-${event.logIndex}`;
  const smartEventId = `event-${event.chainId}-${eventId.toString()}`;
  const userId = buyer.toLowerCase();

  // Get event to calculate total price
  const smartEvent = await context.SmartEvent.get(smartEventId);
  const totalPrice = smartEvent ? smartEvent.price * BigInt(quantity) : BigInt(0);

  // Create ticket purchase
  const ticketPurchase = {
    id: ticketId,
    event_id: smartEventId,
    eventId: eventId.toString(),
    buyer: userId,
    quantity: Number(quantity), // ✅ Convert bigint to number
    totalPrice: totalPrice,
    purchasedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TicketPurchase.set(ticketPurchase);

  // Update event tickets sold
  if (smartEvent) {
    await context.SmartEvent.set({
      ...smartEvent,
      ticketsSold: smartEvent.ticketsSold + Number(quantity), // ✅ Convert bigint to number
    });
  }

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      eventsAttended: (userStats.eventsAttended || 0) + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalTicketsSold: (globalStats.totalTicketsSold || 0) + Number(quantity), // ✅ Convert bigint to number
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎫 User ${buyer} purchased ${quantity} tickets for event #${eventId}`);
});

SmartEventManifest.EventCancelled.handler(async ({ event, context }) => {
  const { eventId } = event.params;

  const smartEventId = `event-${event.chainId}-${eventId.toString()}`;
  const smartEvent = await context.SmartEvent.get(smartEventId);

  if (smartEvent) {
    await context.SmartEvent.set({
      ...smartEvent,
      cancelled: true,
      active: false,
    });

    context.log.info(`❌ Event #${eventId} cancelled: ${smartEvent.name}`);
  }
});

// ============================================
// TANDA YIELD GROUP EVENTS
// ============================================

TandaYieldGroup.GroupCreated.handler(async ({ event, context }) => {
  const { groupId, creator, name } = event.params;

  const tandaGroupId = `tanda-${event.chainId}-${groupId.toString()}`;

  // Create tanda group
  const tandaGroup = {
    id: tandaGroupId,
    groupId: groupId.toString(),
    name: name,
    creator: creator.toLowerCase(),
    contributionAmount: BigInt(0),
    maxMembers: 0,
    currentMembers: 0,
    currentRound: 0,
    totalPool: BigInt(0),
    active: true,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TandaGroup.set(tandaGroup);

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalTandaGroups: (globalStats.totalTandaGroups || 0) + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🤝 Tanda Group #${groupId} created by ${creator}: ${name}`);
});

TandaYieldGroup.MemberJoined.handler(async ({ event, context }) => {
  const { groupId, member } = event.params;

  const memberId = `tandamember-${event.chainId}-${groupId.toString()}-${member.toLowerCase()}`;
  const tandaGroupId = `tanda-${event.chainId}-${groupId.toString()}`;
  const userId = member.toLowerCase();

  // Create tanda member
  const tandaMember = {
    id: memberId,
    group_id: tandaGroupId,
    groupId: groupId.toString(),
    member: userId,
    joinedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TandaMember.set(tandaMember);

  // Update tanda group
  const tandaGroup = await context.TandaGroup.get(tandaGroupId);
  if (tandaGroup) {
    await context.TandaGroup.set({
      ...tandaGroup,
      currentMembers: tandaGroup.currentMembers + 1,
    });
  }

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      tandaGroupsJoined: (userStats.tandaGroupsJoined || 0) + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`👥 Member ${member} joined Tanda Group #${groupId}`);
});

TandaYieldGroup.ContributionMade.handler(async ({ event, context }) => {
  const { groupId, member, amount } = event.params;

  const contributionId = `contribution-${event.block.number}-${event.logIndex}`;
  const tandaGroupId = `tanda-${event.chainId}-${groupId.toString()}`;
  const userId = member.toLowerCase();

  // Get tanda group to get current round
  const tandaGroup = await context.TandaGroup.get(tandaGroupId);
  const currentRound = tandaGroup ? tandaGroup.currentRound : 0;

  // Create contribution
  const contribution = {
    id: contributionId,
    group_id: tandaGroupId,
    groupId: groupId.toString(),
    member: userId,
    amount: amount,
    round: currentRound,
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TandaContribution.set(contribution);

  // Update tanda group pool
  if (tandaGroup) {
    await context.TandaGroup.set({
      ...tandaGroup,
      totalPool: tandaGroup.totalPool + amount,
    });
  }

  context.log.info(`💵 Member ${member} contributed ${amount.toString()} to Tanda Group #${groupId}`);
});

TandaYieldGroup.PayoutClaimed.handler(async ({ event, context }) => {
  const { groupId, member, amount } = event.params;

  const payoutId = `payout-${event.block.number}-${event.logIndex}`;
  const tandaGroupId = `tanda-${event.chainId}-${groupId.toString()}`;
  const userId = member.toLowerCase();

  // Get tanda group to get current round
  const tandaGroup = await context.TandaGroup.get(tandaGroupId);
  const currentRound = tandaGroup ? tandaGroup.currentRound : 0;

  // Create payout
  const payout = {
    id: payoutId,
    group_id: tandaGroupId,
    groupId: groupId.toString(),
    member: userId,
    amount: amount,
    round: currentRound,
    claimedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.TandaPayout.set(payout);

  context.log.info(`💰 Member ${member} claimed ${amount.toString()} payout from Tanda Group #${groupId}`);
});

// ============================================
// CREDIT SCORE CALCULATOR EVENTS
// ============================================

CreditScoreCalculator.ScoreUpdated.handler(async ({ event, context }) => {
  const { user, oldScore, newScore } = event.params;

  const userId = user.toLowerCase();

  // Get or create credit score
  let creditScore = await context.CreditScore.get(userId);

  if (creditScore) {
    await context.CreditScore.set({
      ...creditScore,
      score: newScore,
      lastUpdated: new Date(event.block.timestamp * 1000),
      blockNumber: BigInt(event.block.number),
      txHash: event.transaction.hash,
    });
  } else {
    await context.CreditScore.set({
      id: userId,
      user: userId,
      score: newScore,
      tier: undefined,
      paymentHistory: BigInt(0),
      stakeAmount: BigInt(0),
      tandaParticipation: BigInt(0),
      eventAttendance: BigInt(0),
      lastUpdated: new Date(event.block.timestamp * 1000),
      blockNumber: BigInt(event.block.number),
      txHash: event.transaction.hash,
    });
  }

  context.log.info(`⭐ Credit score updated for ${user}: ${oldScore.toString()} -> ${newScore.toString()}`);
});

CreditScoreCalculator.PaymentRecorded.handler(async ({ event, context }) => {
  const { user, amount, onTime } = event.params;

  const paymentId = `payment-${event.block.number}-${event.logIndex}`;
  const userId = user.toLowerCase();

  // Create payment record
  const paymentRecord = {
    id: paymentId,
    user: userId,
    amount: amount,
    onTime: onTime,
    recordedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.PaymentRecord.set(paymentRecord);

  // Update credit score payment history
  let creditScore = await context.CreditScore.get(userId);
  if (creditScore) {
    await context.CreditScore.set({
      ...creditScore,
      paymentHistory: creditScore.paymentHistory + BigInt(1),
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`💳 Payment recorded for ${user}: ${amount.toString()} TOURS (${onTime ? 'on time' : 'late'})`);
});

// ============================================
// DAILY PASS LOTTERY EVENTS
// ============================================

DailyPassLotteryV3.RoundStarted.handler(async ({ event, context }) => {
  const { roundId, startTime, endTime } = event.params;

  const lotteryRoundId = `round-${event.chainId}-${roundId.toString()}`;

  const lotteryRound = {
    id: lotteryRoundId,
    roundId: roundId.toString(),
    startTime: startTime,
    endTime: endTime,
    prizePoolMon: BigInt(0),
    prizePoolShMon: BigInt(0),
    participantCount: 0,
    status: "Active",
    winner: undefined,
    winnerIndex: undefined,
    monPrize: undefined,
    shMonPrize: undefined,
    randomHash: undefined,
    finalizedAt: undefined,
    announcedOnFarcaster: false,
    announcementCastHash: undefined,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.LotteryRound.set(lotteryRound);

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalLotteryRounds: (globalStats.totalLotteryRounds || 0) + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎰 Lottery Round #${roundId} started - ends at ${new Date(Number(endTime) * 1000).toISOString()}`);
});

DailyPassLotteryV3.DailyPassPurchased.handler(async ({ event, context }) => {
  const { roundId, beneficiary, payer, entryIndex, paidWithShMon, amount } = event.params;

  const lotteryRoundId = `round-${event.chainId}-${roundId.toString()}`;
  const lotteryEntryId = `entry-${event.chainId}-${roundId.toString()}-${entryIndex.toString()}`;
  const userId = beneficiary.toLowerCase();

  // Create lottery entry
  const lotteryEntry = {
    id: lotteryEntryId,
    round_id: lotteryRoundId,
    roundId: roundId.toString(),
    holder: userId,
    entryIndex: Number(entryIndex),
    paidWithShMon: paidWithShMon,
    amount: amount,
    enteredAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.LotteryEntry.set(lotteryEntry);

  // Update lottery round
  const lotteryRound = await context.LotteryRound.get(lotteryRoundId);
  if (lotteryRound) {
    await context.LotteryRound.set({
      ...lotteryRound,
      prizePoolMon: paidWithShMon ? lotteryRound.prizePoolMon : lotteryRound.prizePoolMon + amount,
      prizePoolShMon: paidWithShMon ? lotteryRound.prizePoolShMon + amount : lotteryRound.prizePoolShMon,
      participantCount: lotteryRound.participantCount + 1,
    });
  }

  // Update user lottery stats
  let userLotteryStats = await context.UserLotteryStats.get(userId);
  if (userLotteryStats) {
    await context.UserLotteryStats.set({
      ...userLotteryStats,
      totalEntriesMon: paidWithShMon ? userLotteryStats.totalEntriesMon : userLotteryStats.totalEntriesMon + 1,
      totalEntriesShMon: paidWithShMon ? userLotteryStats.totalEntriesShMon + 1 : userLotteryStats.totalEntriesShMon,
      totalSpentMon: paidWithShMon ? userLotteryStats.totalSpentMon : userLotteryStats.totalSpentMon + amount,
      totalSpentShMon: paidWithShMon ? userLotteryStats.totalSpentShMon + amount : userLotteryStats.totalSpentShMon,
      lastEntryAt: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserLotteryStats.set({
      id: userId,
      user: userId,
      totalEntriesMon: paidWithShMon ? 0 : 1,
      totalEntriesShMon: paidWithShMon ? 1 : 0,
      totalSpentMon: paidWithShMon ? BigInt(0) : amount,
      totalSpentShMon: paidWithShMon ? amount : BigInt(0),
      wins: 0,
      totalWonMon: BigInt(0),
      totalWonShMon: BigInt(0),
      lastEntryAt: new Date(event.block.timestamp * 1000),
      lastWinAt: undefined,
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");
  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalLotteryEntries: (globalStats.totalLotteryEntries || 0) + 1,
      totalLotteryPrizePool: (globalStats.totalLotteryPrizePool || BigInt(0)) + amount,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎫 Lottery entry #${entryIndex} for round ${roundId} - ${beneficiary} (paid by ${payer}) ${amount.toString()} ${paidWithShMon ? 'shMON' : 'MON'}`);
});

DailyPassLotteryV3.RandomnessCommitted.handler(async ({ event, context }) => {
  const { roundId, commitBlock, commitHash, caller, reward } = event.params;

  const lotteryRoundId = `round-${event.chainId}-${roundId.toString()}`;

  // Update lottery round
  const lotteryRound = await context.LotteryRound.get(lotteryRoundId);
  if (lotteryRound) {
    await context.LotteryRound.set({
      ...lotteryRound,
      status: "RevealPending",
    });
  }

  context.log.info(`🔐 Randomness committed for round ${roundId} at block ${commitBlock} by ${caller} (reward: ${reward.toString()})`);
});

DailyPassLotteryV3.WinnerRevealed.handler(async ({ event, context }) => {
  const { roundId, winner, winnerIndex, monPrize, shMonPrize, caller, reward } = event.params;

  const lotteryRoundId = `round-${event.chainId}-${roundId.toString()}`;
  const winnerHistoryId = `winner-${event.chainId}-${roundId.toString()}`;
  const userId = winner.toLowerCase();

  // Update lottery round
  const lotteryRound = await context.LotteryRound.get(lotteryRoundId);
  if (lotteryRound) {
    await context.LotteryRound.set({
      ...lotteryRound,
      status: "Finalized",
      winner: userId,
      winnerIndex: Number(winnerIndex),
      monPrize: monPrize,
      shMonPrize: shMonPrize,
      randomHash: undefined, // Not included in new event signature
      finalizedAt: new Date(event.block.timestamp * 1000),
    });

    // Create winner history entry
    const winnerHistory = {
      id: winnerHistoryId,
      roundId: roundId.toString(),
      winner: userId,
      winnerFid: undefined,
      winnerUsername: undefined,
      monPrize: monPrize,
      shMonPrize: shMonPrize,
      totalPrize: monPrize + shMonPrize,
      participantCount: lotteryRound.participantCount,
      randomHash: undefined, // Not included in new event signature
      claimed: false,
      claimedAt: undefined,
      finalizedAt: new Date(event.block.timestamp * 1000),
      blockNumber: BigInt(event.block.number),
      txHash: event.transaction.hash,
    };

    await context.LotteryWinnerHistory.set(winnerHistory);
  }

  // Update user lottery stats
  let userLotteryStats = await context.UserLotteryStats.get(userId);
  if (userLotteryStats) {
    await context.UserLotteryStats.set({
      ...userLotteryStats,
      wins: userLotteryStats.wins + 1,
      totalWonMon: userLotteryStats.totalWonMon + monPrize,
      totalWonShMon: userLotteryStats.totalWonShMon + shMonPrize,
      lastWinAt: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🏆 WINNER for Round #${roundId}: ${winner} (revealed by ${caller}, reward: ${reward.toString()}) - Prize: ${monPrize.toString()} MON + ${shMonPrize.toString()} shMON`);

  // ✅ Announce lottery winner on Farcaster
  if (lotteryRound) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
      const monPrizeInMon = (Number(monPrize) / 1e18).toFixed(4);
      const shMonPrizeInShMon = (Number(shMonPrize) / 1e18).toFixed(4);

      const response = await fetch(`${appUrl}/api/cast-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lottery_winner',
          roundId: roundId.toString(),
          winnerAddress: winner,
          monPrize: monPrizeInMon,
          shMonPrize: shMonPrizeInShMon,
          participantCount: lotteryRound.participantCount,
          txHash: event.transaction.hash,
          fid: undefined, // Will be looked up by address if available
        }),
      });

      if (response.ok) {
        const result = await response.json() as any;
        context.log.info(`📢 Lottery winner announced on Farcaster: ${result.castHash}`);

        // Mark as announced in the round
        await context.LotteryRound.set({
          ...lotteryRound,
          status: "Finalized",
          winner: userId,
          winnerIndex: Number(winnerIndex),
          monPrize: monPrize,
          shMonPrize: shMonPrize,
          randomHash: undefined,
          finalizedAt: new Date(event.block.timestamp * 1000),
          announcedOnFarcaster: true,
          announcementCastHash: result.castHash,
        });
      } else {
        context.log.warn(`⚠️ Failed to announce lottery winner on Farcaster`);
      }
    } catch (error: any) {
      context.log.warn(`⚠️ Error announcing lottery winner: ${error.message}`);
    }
  }
});

DailyPassLotteryV3.PrizeClaimed.handler(async ({ event, context }) => {
  const { roundId, winner, monAmount, shMonAmount } = event.params;

  const winnerHistoryId = `winner-${event.chainId}-${roundId.toString()}`;

  // Update winner history
  const winnerHistory = await context.LotteryWinnerHistory.get(winnerHistoryId);
  if (winnerHistory) {
    await context.LotteryWinnerHistory.set({
      ...winnerHistory,
      claimed: true,
      claimedAt: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`💰 Prize claimed for Round #${roundId} by ${winner}: ${monAmount.toString()} MON + ${shMonAmount.toString()} shMON`);
});

DailyPassLotteryV3.EscrowExpired.handler(async ({ event, context }) => {
  const { roundId } = event.params;

  context.log.info(`⏰ Escrow expired for Round #${roundId} - unclaimed prize returned to platform`);
});

// ============================================
// MUSIC BEAT MATCH V2 EVENTS
// ============================================

MusicBeatMatchV2.DailyChallengeCreated.handler(async ({ event, context }) => {
  const { challengeId, artistId, songTitle, artistUsername, ipfsAudioHash, startTime, endTime } = event.params;

  const beatMatchChallengeId = `challenge-${event.chainId}-${challengeId.toString()}`;

  const challenge = {
    id: beatMatchChallengeId,
    challengeId: challengeId.toString(),
    artistId: artistId.toString(),
    songTitle: songTitle,
    artistUsername: artistUsername,
    ipfsAudioHash: ipfsAudioHash,
    startTime: startTime,
    endTime: endTime,
    active: true,
    finalized: false,
    winner: undefined,
    rewardAmount: undefined,
    totalGuesses: 0,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.BeatMatchChallenge.set(challenge);

  context.log.info(`🎵 Beat Match Challenge #${challengeId} created: "${songTitle}" by @${artistUsername} (Artist ID: ${artistId})`);
});

MusicBeatMatchV2.GuessSubmitted.handler(async ({ event, context }) => {
  const { challengeId, player, guessedArtistId, guessedSongTitle, guessedUsername } = event.params;

  const beatMatchChallengeId = `challenge-${event.chainId}-${challengeId.toString()}`;
  const guessId = `guess-${event.chainId}-${challengeId.toString()}-${player.toLowerCase()}`;

  const guess = {
    id: guessId,
    challenge_id: beatMatchChallengeId,
    challengeId: challengeId.toString(),
    player: player.toLowerCase(),
    guessedArtistId: guessedArtistId.toString(),
    guessedSongTitle: guessedSongTitle,
    guessedUsername: guessedUsername,
    correct: undefined, // Will be determined when finalized
    submittedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.BeatMatchGuess.set(guess);

  // Update challenge guess count
  const challenge = await context.BeatMatchChallenge.get(beatMatchChallengeId);
  if (challenge) {
    await context.BeatMatchChallenge.set({
      ...challenge,
      totalGuesses: challenge.totalGuesses + 1,
    });
  }

  context.log.info(`🎯 Guess submitted for Challenge #${challengeId} by ${player}: "${guessedSongTitle}" by @${guessedUsername} (ID: ${guessedArtistId})`);
});

MusicBeatMatchV2.ChallengeFinalized.handler(async ({ event, context }) => {
  const { challengeId, winner, rewardAmount } = event.params;

  const beatMatchChallengeId = `challenge-${event.chainId}-${challengeId.toString()}`;

  // Update challenge
  const challenge = await context.BeatMatchChallenge.get(beatMatchChallengeId);
  if (challenge) {
    await context.BeatMatchChallenge.set({
      ...challenge,
      active: false,
      finalized: true,
      winner: winner === "0x0000000000000000000000000000000000000000" ? undefined : winner.toLowerCase(),
      rewardAmount: rewardAmount,
    });
  }

  context.log.info(`🏆 Beat Match Challenge #${challengeId} finalized - Winner: ${winner}, Reward: ${rewardAmount.toString()} TOURS`);
});

// ============================================
// COUNTRY COLLECTOR V2 EVENTS
// ============================================

CountryCollectorV2.WeeklyChallengeCreated.handler(async ({ event, context }) => {
  const { weekId, country, countryCode, artistIds, startTime, endTime } = event.params;

  const countryChallengeId = `week-${event.chainId}-${weekId.toString()}`;

  const challenge = {
    id: countryChallengeId,
    weekId: weekId.toString(),
    country: country,
    countryCode: countryCode,
    artistIds: artistIds.map((id: bigint) => id.toString()),
    startTime: startTime,
    endTime: endTime,
    active: true,
    finalized: false,
    totalCompletions: 0,
    rewardAmount: undefined,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.CountryChallenge.set(challenge);

  context.log.info(`🌍 Country Collector Week #${weekId} created: ${country} (${countryCode}) - Artists: [${artistIds.join(', ')}]`);
});

CountryCollectorV2.ArtistCompleted.handler(async ({ event, context }) => {
  const { weekId, player, artistIndex, artistId } = event.params;

  const countryChallengeId = `week-${event.chainId}-${weekId.toString()}`;
  const completionId = `completion-${event.chainId}-${weekId.toString()}-${player.toLowerCase()}-${artistIndex.toString()}`;
  const progressId = `progress-${event.chainId}-${weekId.toString()}-${player.toLowerCase()}`;

  // Create artist completion
  const completion = {
    id: completionId,
    challenge_id: countryChallengeId,
    weekId: weekId.toString(),
    player: player.toLowerCase(),
    artistIndex: Number(artistIndex),
    artistId: artistId.toString(),
    completedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.ArtistCompletion.set(completion);

  // Update or create player progress
  let progress = await context.CountryPlayerProgress.get(progressId);
  if (progress) {
    await context.CountryPlayerProgress.set({
      ...progress,
      completedArtists: progress.completedArtists + 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.CountryPlayerProgress.set({
      id: progressId,
      challenge_id: countryChallengeId,
      weekId: weekId.toString(),
      player: player.toLowerCase(),
      completedArtists: 1,
      allCompleted: false,
      rewardClaimed: false,
      rewardAmount: undefined,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`✅ Player ${player} completed artist #${artistIndex} (ID: ${artistId}) in Week #${weekId}`);
});

CountryCollectorV2.ChallengeCompleted.handler(async ({ event, context }) => {
  const { weekId, player, rewardAmount } = event.params;

  const progressId = `progress-${event.chainId}-${weekId.toString()}-${player.toLowerCase()}`;

  // Update player progress
  const progress = await context.CountryPlayerProgress.get(progressId);
  if (progress) {
    await context.CountryPlayerProgress.set({
      ...progress,
      allCompleted: true,
      rewardClaimed: true,
      rewardAmount: rewardAmount,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  // Update challenge completion count
  const countryChallengeId = `week-${event.chainId}-${weekId.toString()}`;
  const challenge = await context.CountryChallenge.get(countryChallengeId);
  if (challenge) {
    await context.CountryChallenge.set({
      ...challenge,
      totalCompletions: challenge.totalCompletions + 1,
    });
  }

  context.log.info(`🎉 Player ${player} completed all artists in Week #${weekId} - Reward: ${rewardAmount.toString()} TOURS`);
});

CountryCollectorV2.WeekFinalized.handler(async ({ event, context }) => {
  const { weekId, totalCompletions } = event.params;

  const countryChallengeId = `week-${event.chainId}-${weekId.toString()}`;

  // Update challenge
  const challenge = await context.CountryChallenge.get(countryChallengeId);
  if (challenge) {
    await context.CountryChallenge.set({
      ...challenge,
      active: false,
      finalized: true,
      totalCompletions: Number(totalCompletions),
    });
  }

  context.log.info(`🏁 Country Collector Week #${weekId} finalized - Total completions: ${totalCompletions}`);
});
