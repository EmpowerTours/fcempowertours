import {
  EmpowerToursNFT,
  PassportNFTV2,
  ItineraryNFTV2,
  PlayOracleV3,
  MusicSubscriptionV5,
  LiveRadioV3,
  ClimbingLocationsV2,
  ToursRewardManager,
  VotingTOURS,
  EmpowerToursGovernor,
  EmpowerToursTimelock,
  DAOContractFactory,
  DeploymentNFT,
  EmpowerToursDevStudio,
  DailyLottery,
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
  const { tokenId, artist, artistFid, tokenURI, price, nftType, royalty } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;

  // ✅ V6: Use nftType from event (0 = Music, 1 = Art)
  const isArt = nftType === BigInt(1);

  // ✅ V9: Convert royalty from basis points (e.g. 5000 = 50% -> 50, 500 = 5% -> 5)
  const royaltyPercent = Number(royalty) / 100;

  context.log.info(`🎵 Processing MasterMinted event for tokenId ${tokenId}`);
  context.log.info(`   Artist: ${artist}`);
  context.log.info(`   Artist FID: ${artistFid.toString()}`);
  context.log.info(`   TokenURI: ${tokenURI}`);
  context.log.info(`   Price: ${price.toString()}`);
  context.log.info(`   Royalty: ${royaltyPercent}%`);
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
    artistFid: artistFid.toString(), // ✅ V9: Store artist Farcaster ID
    owner: artist.toLowerCase(),
    tokenURI: tokenURI, // ✅ CORRECT: Preserves original case
    price: price,
    totalSold: 0,
    active: true,
    coverArt: "",
    royaltyPercentage: royaltyPercent, // ✅ V9: Use royalty from event

    // ✅ Store metadata fields (with fallbacks)
    name: metadata?.name || `Music NFT #${tokenId}`,
    description: metadata?.description || "",
    imageUrl: metadata?.imageUrl || "",
    previewAudioUrl: metadata?.previewAudioUrl || "",
    fullAudioUrl: metadata?.fullAudioUrl || "",
    metadataFetched: !!metadata,
    isArt: isArt,

    // ✅ V10: Initialize burning fields
    isBurned: false,
    burnedAt: BigInt(0),
    burnReason: undefined,
    burnType: undefined,

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
      stolenContentBurns: 0,
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

// ✅ Handle CollectorMasterMinted event
EmpowerToursNFT.CollectorMasterMinted.handler(async ({ event, context }) => {
  const { tokenId, artist, artistFid, maxEditions, collectorPrice } = event.params;

  context.log.info(`🎵 CollectorMaster #${tokenId} minted by ${artist} (FID: ${artistFid})`);
  context.log.info(`   Max Editions: ${maxEditions}, Collector Price: ${collectorPrice}`);
});

// ✅ Handle LicensePurchased event (with expiry timestamp)
EmpowerToursNFT.LicensePurchased.handler(async ({ event, context }) => {
  const { licenseId, masterTokenId, licenseeFid, buyer, expiry, isCollector } = event.params;

  const musicNFTId = `music-${event.chainId}-${masterTokenId.toString()}`;
  const musicLicenseId = `license-${event.chainId}-${licenseId.toString()}`;

  const timestamp = new Date(event.block.timestamp * 1000);

  // Create MusicLicense entity (expiry = 0 means perpetual)
  const musicLicense = {
    id: musicLicenseId,
    licenseId: licenseId.toString(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: musicNFTId,
    licensee: buyer.toLowerCase(),
    licenseeFid: licenseeFid.toString(),
    isCollector: isCollector,
    active: true,
    expiry: expiry,
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
      stolenContentBurns: 0,
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

  const expiryDate = expiry > 0n ? new Date(Number(expiry) * 1000).toISOString() : 'Perpetual';
  context.log.info(
    `💳 License #${licenseId} purchased for Music NFT #${masterTokenId} by ${buyer} (FID: ${licenseeFid}, Collector: ${isCollector}, Expiry: ${expiryDate})`
  );
});

// ✅ Handle LicenseSold event (resale/secondary market)
EmpowerToursNFT.LicenseSold.handler(async ({ event, context }) => {
  const { licenseId, masterTokenId, seller, buyer, salePrice, royaltyPaid, royaltyRecipient } = event.params;

  const musicLicenseId = `license-${event.chainId}-${licenseId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Update existing license with new owner
  const existingLicense = await context.MusicLicense.get(musicLicenseId);
  if (existingLicense) {
    await context.MusicLicense.set({
      ...existingLicense,
      licensee: buyer.toLowerCase(),
      // Keep licenseeFid as unknown for resale buyers (they may not have FID)
    });
  }

  // Update seller stats (decrease license count)
  const sellerId = seller.toLowerCase();
  const sellerStats = await context.UserStats.get(sellerId);
  if (sellerStats) {
    await context.UserStats.set({
      ...sellerStats,
      licensesOwned: Math.max(0, (sellerStats.licensesOwned || 1) - 1),
      lastActive: timestamp,
    });
  }

  // Update buyer stats (increase license count)
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
      stolenContentBurns: 0,
      lastActive: timestamp,
    });
  }

  // Update global stats (new user if applicable)
  if (isNewUser) {
    const globalStats = await context.GlobalStats.get("global");
    if (globalStats) {
      await context.GlobalStats.set({
        ...globalStats,
        totalUsers: globalStats.totalUsers + 1,
        lastUpdated: timestamp,
      });
    }
  }

  context.log.info(
    `🔄 License #${licenseId} RESOLD: ${seller} → ${buyer} for ${salePrice} (Royalty: ${royaltyPaid} to ${royaltyRecipient})`
  );
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
// EMPOWERTOURSNFT V10: BURNING EVENTS
// ============================================

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

// ✅ DAO Governance - Stolen Content Removal
EmpowerToursNFT.StolenContentBurned.handler(async ({ event, context }) => {
  const { tokenId, originalOwner, reason, timestamp } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    // Mark NFT as burned due to stolen content
    await context.MusicNFT.set({
      ...musicNFT,
      isBurned: true,
      burnedAt: timestamp,
      burnReason: reason,
      burnType: 'stolen_content',
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
        stolenContentBurns: (userStats.stolenContentBurns || 0) + 1,
        lastActive: new Date(event.block.timestamp * 1000),
      });
    }

    context.log.info(`🚨 STOLEN CONTENT BURNED: NFT #${tokenId} owned by ${originalOwner} - Reason: ${reason}`);
  }
});

// ✅ Artist Song Cleared (allows reminting after burn)
EmpowerToursNFT.ArtistSongCleared.handler(async ({ event, context }) => {
  const { artist, title, timestamp } = event.params;

  context.log.info(`🎵 Artist song cleared for reminting - Artist: ${artist}, Title: "${title}" at ${timestamp}`);
});

// ✅ Royalty tracking
EmpowerToursNFT.RoyaltyPaid.handler(async ({ event, context }) => {
  const { masterTokenId, artist, amount } = event.params;

  const royaltyId = `royalty-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  // Format amount (assuming 18 decimals for WMON)
  const amountFormatted = (Number(amount) / 1e18).toFixed(4);

  await context.RoyaltyPayment.set({
    id: royaltyId,
    masterTokenId: masterTokenId.toString(),
    masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
    artist: artist.toLowerCase(),
    amount: amount,
    amountFormatted: amountFormatted,
    paidAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update song streaming stats with royalty earnings
  const songStatsId = `stats-${event.chainId}-${masterTokenId.toString()}`;
  let songStats = await context.SongStreamingStats.get(songStatsId);

  if (songStats) {
    await context.SongStreamingStats.set({
      ...songStats,
      totalRoyaltiesEarned: songStats.totalRoyaltiesEarned + amount,
    });
  }

  // Update artist streaming stats
  const artistStatsId = `artist-stats-${event.chainId}-${artist.toLowerCase()}`;
  let artistStats = await context.ArtistStreamingStats.get(artistStatsId);

  if (artistStats) {
    await context.ArtistStreamingStats.set({
      ...artistStats,
      totalEarningsWMON: artistStats.totalEarningsWMON + amount,
    });
  }

  context.log.info(`💎 Royalty paid: ${artist.slice(0, 8)}... received ${amountFormatted} WMON for song #${masterTokenId}`);
});

// ✅ Price update tracking
EmpowerToursNFT.PriceUpdated.handler(async ({ event, context }) => {
  const { masterTokenId, newPrice } = event.params;

  const musicNFTId = `music-${event.chainId}-${masterTokenId.toString()}`;
  const musicNFT = await context.MusicNFT.get(musicNFTId);

  if (musicNFT) {
    await context.MusicNFT.set({
      ...musicNFT,
      price: newPrice,
    });
  }

  context.log.info(`💰 Price updated for Music NFT #${masterTokenId}: ${newPrice}`);
});

// ============================================
// PASSPORT NFT EVENTS
// ============================================

PassportNFTV2.PassportMinted.handler(async ({ event, context }) => {
  const { tokenId, owner, userFid, countryCode, countryName, region, continent, verified } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

  context.log.info(`🛂 Passport #${tokenId} minted for owner ${owner} (FID: ${userFid}, Country: ${countryCode}, Region: ${region}, Continent: ${continent}, Verified: ${verified})`);

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
    userFid: userFid.toString(), // ✅ Farcaster ID
    countryCode: normalizedCountryCode, // ✅ FIX: Store as uppercase
    countryName: countryName,
    region: region,
    continent: continent,
    verified: verified, // ✅ Verification status
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
      stolenContentBurns: 0,
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

PassportNFTV2.Transfer.handler(async ({ event, context }) => {
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

// ✅ V2: Verification flow handlers (renamed events)
PassportNFTV2.VerificationProofSubmitted.handler(async ({ event, context }) => {
  const { tokenId, submitter, proofIPFSHash, timestamp } = event.params;

  context.log.info(`📸 Verification proof submitted for Passport #${tokenId} by ${submitter} - proof: ${proofIPFSHash}`);
});

PassportNFTV2.PassportVerified.handler(async ({ event, context }) => {
  const { tokenId, verifier, verificationProof, timestamp } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const passportNFT = await context.PassportNFT.get(passportNFTId);

  if (passportNFT) {
    await context.PassportNFT.set({
      ...passportNFT,
      verified: true,
    });
  }

  context.log.info(`✅ Passport #${tokenId} verified by ${verifier} - proof: ${verificationProof}`);
});

// ✅ V2: Venue stamp handler (location, placeId, verified, timestamp)
PassportNFTV2.VenueStampAdded.handler(async ({ event, context }) => {
  const { tokenId, location, placeId, verified, timestamp } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const venueStampId = `venue-stamp-${event.block.number}-${event.logIndex}`;

  // Create venue stamp
  const venueStamp = {
    id: venueStampId,
    passport_id: passportNFTId,
    tokenId: tokenId.toString(),
    location: location,
    placeId: placeId,
    eventType: "",
    artist: undefined,
    timestamp: BigInt(Number(timestamp)),
    verified: verified,
    addedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.VenueStamp.set(venueStamp);

  // Update passport stamp count and credit score (+10 base, +5 if verified)
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const creditAdded = verified ? 15 : 10;
    const newStampCount = passportNFT.stampCount + 1;
    const newVerifiedCount = verified ? passportNFT.verifiedStampCount + 1 : passportNFT.verifiedStampCount;
    const newCreditScore = passportNFT.creditScore + creditAdded;

    await context.PassportNFT.set({
      ...passportNFT,
      stampCount: newStampCount,
      verifiedStampCount: newVerifiedCount,
      creditScore: newCreditScore,
    });

    context.log.info(`🎟️ Venue stamp added to Passport #${tokenId}: "${location}" (placeId: ${placeId}, verified: ${verified}, +${creditAdded} credit). New score: ${newCreditScore}`);
  }
});

// ✅ V2: Itinerary stamp handler (locationName, city, country, placeId, gpsVerified, timestamp)
PassportNFTV2.ItineraryStampAdded.handler(async ({ event, context }) => {
  const { tokenId, itineraryId, locationName, city, country, placeId, gpsVerified, timestamp } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

  // Update passport credit score (+15 base, +10 if GPS verified)
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const creditAdded = gpsVerified ? 25 : 15;
    const newCreditScore = passportNFT.creditScore + creditAdded;

    await context.PassportNFT.set({
      ...passportNFT,
      creditScore: newCreditScore,
    });

    context.log.info(`🗺️ Itinerary stamp added to Passport #${tokenId} for itinerary #${itineraryId}: "${locationName}" in ${city}, ${country} (placeId: ${placeId}, GPS: ${gpsVerified}, +${creditAdded} credit). New score: ${newCreditScore}`);
  }
});

// ============================================
// ITINERARY NFT EVENTS
// ============================================

ItineraryNFTV2.ItineraryCreated.handler(async ({ event, context }) => {
  const { itineraryId, creator, creatorFid, title, price, photoProof } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;
  const userId = creator.toLowerCase();
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create itinerary entity with enriched fields
  const itinerary = {
    id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    creator: userId,
    creatorFid: creatorFid.toString(),
    title: title,
    description: title, // Legacy compatibility
    photoProofIPFS: photoProof || undefined,
    price: price,
    active: true,
    averageRating: BigInt(0),
    ratingCount: 0,
    totalRatingSum: BigInt(0),
    totalPurchases: 0,
    createdAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.Itinerary.set(itinerary);

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      itinerariesCreated: userStats.itinerariesCreated + 1,
      lastActive: timestamp,
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: creator.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 1,
      itinerariesPurchased: 0,
      experiencesCreated: 0,
      experiencesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      stolenContentBurns: 0,
      lastActive: timestamp,
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalItineraries: globalStats.totalItineraries + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: timestamp,
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 0,
      totalPassports: 0,
      totalItineraries: 1,
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
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🗺️ Itinerary #${itineraryId} created by ${creator} (FID: ${creatorFid}) - "${title}" (photo: ${photoProof})`);
});

ItineraryNFTV2.ItineraryPurchased.handler(async ({ event, context }) => {
  const { itineraryId, buyer, buyerFid, price, creatorEarnings } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;
  const purchaseId = `purchase-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const userId = buyer.toLowerCase();
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create purchase record
  await context.ItineraryPurchase.set({
    id: purchaseId,
    itinerary_id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    buyer: userId,
    timestamp: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update itinerary purchase count
  const itinerary = await context.Itinerary.get(itineraryEntityId);
  if (itinerary) {
    await context.Itinerary.set({
      ...itinerary,
      totalPurchases: (itinerary.totalPurchases || 0) + 1,
    });
  }

  // Update user stats
  let userStats = await context.UserStats.get(userId);
  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      itinerariesPurchased: userStats.itinerariesPurchased + 1,
      lastActive: timestamp,
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: buyer.toLowerCase(),
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 1,
      experiencesCreated: 0,
      experiencesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 0,
      eventsAttended: 0,
      tandaGroupsJoined: 0,
      stolenContentBurns: 0,
      lastActive: timestamp,
    });
  }

  // Update global stats
  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalItineraryPurchases: globalStats.totalItineraryPurchases + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎫 Itinerary #${itineraryId} purchased by ${buyer} (FID: ${buyerFid}) for ${price} (creator earned: ${creatorEarnings})`);
});

ItineraryNFTV2.LocationCompleted.handler(async ({ event, context }) => {
  const { itineraryId, user, locationIndex, placeId, photoProof } = event.params;

  context.log.info(`📍 Location ${locationIndex} completed for Itinerary #${itineraryId} by ${user.slice(0, 8)}... (placeId: ${placeId}, proof: ${photoProof})`);
});

ItineraryNFTV2.ItineraryCompleted.handler(async ({ event, context }) => {
  const { itineraryId, user } = event.params;

  context.log.info(`🏆 Itinerary #${itineraryId} fully completed by ${user.slice(0, 8)}...`);
});

ItineraryNFTV2.ItineraryRated.handler(async ({ event, context }) => {
  const { itineraryId, user, rating } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;
  const itinerary = await context.Itinerary.get(itineraryEntityId);

  if (itinerary) {
    const newRatingCount = (itinerary.ratingCount || 0) + 1;
    const newTotalRatingSum = (itinerary.totalRatingSum || BigInt(0)) + BigInt(rating.toString());
    const newAverageRating = newTotalRatingSum / BigInt(newRatingCount);

    await context.Itinerary.set({
      ...itinerary,
      ratingCount: newRatingCount,
      totalRatingSum: newTotalRatingSum,
      averageRating: newAverageRating,
    });
  }

  context.log.info(`⭐ Itinerary #${itineraryId} rated ${rating}/500 by ${user.slice(0, 8)}...`);
});

ItineraryNFTV2.LocationAdded.handler(async ({ event, context }) => {
  const { itineraryId, locationIndex, placeId } = event.params;

  context.log.info(`📌 Location added to Itinerary #${itineraryId}: index ${locationIndex}, placeId: ${placeId}`);
});

ItineraryNFTV2.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  // Skip mint events
  if (from === "0x0000000000000000000000000000000000000000") {
    return;
  }

  context.log.info(`🗺️ Itinerary NFT #${tokenId} transferred from ${from} to ${to}`);
});

// =============================================================================
// ✅ PlayOracleV3 Event Handlers (Music Streaming Stats)
// =============================================================================

PlayOracleV3.PlayRecorded.handler(async ({ event, context }) => {
  const { user, masterTokenId, duration, timestamp } = event.params;

  const playId = `play-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  // Create play record
  await context.PlayRecord.set({
    id: playId,
    user: user.toLowerCase(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
    duration: duration,
    timestamp: timestamp,
    playedAt: new Date(Number(timestamp) * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update song streaming stats
  const songStatsId = `stats-${event.chainId}-${masterTokenId.toString()}`;
  let songStats = await context.SongStreamingStats.get(songStatsId);

  if (!songStats) {
    songStats = {
      id: songStatsId,
      masterTokenId: masterTokenId.toString(),
      masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
      totalPlays: 0,
      totalDuration: BigInt(0),
      uniqueListeners: 0,
      totalRoyaltiesEarned: BigInt(0),
      lastPlayedAt: undefined,
    };
  }

  await context.SongStreamingStats.set({
    ...songStats,
    totalPlays: songStats.totalPlays + 1,
    totalDuration: songStats.totalDuration + duration,
    lastPlayedAt: new Date(Number(timestamp) * 1000),
  });

  context.log.info(`🎵 Play recorded: User ${user.slice(0, 8)}... played song #${masterTokenId} for ${duration}s`);
});

PlayOracleV3.OperatorAdded.handler(async ({ event, context }) => {
  const { operator } = event.params;
  context.log.info(`➕ PlayOracle operator added: ${operator}`);
});

PlayOracleV3.OperatorRemoved.handler(async ({ event, context }) => {
  const { operator } = event.params;
  context.log.info(`➖ PlayOracle operator removed: ${operator}`);
});

// =============================================================================
// ✅ MusicSubscriptionV5 Event Handlers (Artist Payouts & More Play Records)
// =============================================================================

MusicSubscriptionV5.Subscribed.handler(async ({ event, context }) => {
  const { user, userFid, tier, expiry, paidAmount } = event.params;

  const subscriptionId = `sub-${event.chainId}-${user.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.Subscription.set({
    id: subscriptionId,
    user: user.toLowerCase(),
    userFid: userFid.toString(),
    tier: Number(tier),
    expiry: expiry,
    paidAmount: paidAmount,
    active: true,
    subscribedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🎵 User ${user.slice(0, 8)}... subscribed (FID: ${userFid}, Tier: ${tier}, Expiry: ${new Date(Number(expiry) * 1000).toISOString()})`);
});

MusicSubscriptionV5.SubscriptionRenewed.handler(async ({ event, context }) => {
  const { user, newExpiry } = event.params;

  const subscriptionId = `sub-${event.chainId}-${user.toLowerCase()}`;
  const subscription = await context.Subscription.get(subscriptionId);

  if (subscription) {
    await context.Subscription.set({
      ...subscription,
      expiry: newExpiry,
    });
  }

  context.log.info(`🔄 Subscription renewed for ${user.slice(0, 8)}... - new expiry: ${new Date(Number(newExpiry) * 1000).toISOString()}`);
});

MusicSubscriptionV5.PlayRecorded.handler(async ({ event, context }) => {
  const { user, masterTokenId, duration, timestamp } = event.params;

  // This may duplicate PlayOracle records, but creates from subscription contract too
  const playId = `play-sub-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.PlayRecord.set({
    id: playId,
    user: user.toLowerCase(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
    duration: duration,
    timestamp: timestamp,
    playedAt: new Date(Number(timestamp) * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🎵 [Sub] Play recorded: User ${user.slice(0, 8)}... played song #${masterTokenId}`);
});

MusicSubscriptionV5.MonthlyDistributionFinalized.handler(async ({ event, context }) => {
  const { monthId, totalRevenue, totalPlays, artistPool } = event.params;

  const distributionId = `distribution-${event.chainId}-${monthId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.MonthlyDistribution.set({
    id: distributionId,
    monthId: monthId.toString(),
    totalRevenue: totalRevenue,
    totalPlays: totalPlays,
    artistPool: artistPool,
    finalizedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`📊 Monthly distribution #${monthId} finalized: Revenue: ${totalRevenue}, Plays: ${totalPlays}, Artist Pool: ${artistPool}`);
});

MusicSubscriptionV5.ArtistPayout.handler(async ({ event, context }) => {
  const { monthId, artist, amount, playCount } = event.params;

  const payoutId = `payout-${event.chainId}-${monthId.toString()}-${artist.toLowerCase()}`;

  // Format amount (assuming 18 decimals for WMON)
  const amountFormatted = (Number(amount) / 1e18).toFixed(4);

  await context.ArtistPayout.set({
    id: payoutId,
    monthId: monthId.toString(),
    artist: artist.toLowerCase(),
    amount: amount,
    amountFormatted: amountFormatted,
    playCount: playCount,
    paidAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update artist streaming stats
  const artistStatsId = `artist-stats-${event.chainId}-${artist.toLowerCase()}`;
  let artistStats = await context.ArtistStreamingStats.get(artistStatsId);

  if (!artistStats) {
    artistStats = {
      id: artistStatsId,
      artist: artist.toLowerCase(),
      totalPlays: 0,
      totalSongs: 0,
      uniqueListeners: 0,
      totalEarningsWMON: BigInt(0),
      totalEarningsTOURS: BigInt(0),
      lastPayoutAt: undefined,
    };
  }

  await context.ArtistStreamingStats.set({
    ...artistStats,
    totalPlays: artistStats.totalPlays + Number(playCount),
    totalEarningsWMON: artistStats.totalEarningsWMON + amount,
    lastPayoutAt: new Date(event.block.timestamp * 1000),
  });

  context.log.info(`💰 Artist payout: ${artist.slice(0, 8)}... received ${amountFormatted} WMON for ${playCount} plays in month ${monthId}`);
});

MusicSubscriptionV5.ArtistToursReward.handler(async ({ event, context }) => {
  const { monthId, artist, toursAmount } = event.params;

  // Update artist stats with TOURS rewards
  const artistStatsId = `artist-stats-${event.chainId}-${artist.toLowerCase()}`;
  let artistStats = await context.ArtistStreamingStats.get(artistStatsId);

  if (artistStats) {
    await context.ArtistStreamingStats.set({
      ...artistStats,
      totalEarningsTOURS: artistStats.totalEarningsTOURS + toursAmount,
    });
  }

  const toursFormatted = (Number(toursAmount) / 1e18).toFixed(2);
  context.log.info(`🎁 TOURS reward: ${artist.slice(0, 8)}... received ${toursFormatted} TOURS for month ${monthId}`);
});

MusicSubscriptionV5.ReserveAdded.handler(async ({ event, context }) => {
  const { monthId, amount, totalReserve } = event.params;

  context.log.info(`💰 Reserve added for month ${monthId}: ${amount} (total: ${totalReserve})`);
});

MusicSubscriptionV5.ReserveWithdrawnToDAO.handler(async ({ event, context }) => {
  const { dao, amount } = event.params;

  context.log.info(`💸 Reserve withdrawn to DAO ${dao}: ${amount}`);
});

MusicSubscriptionV5.AccountFlagged.handler(async ({ event, context }) => {
  const { user, reason } = event.params;

  context.log.info(`🚩 Account flagged: ${user} - reason: ${reason}`);
});

MusicSubscriptionV5.AccountUnflagged.handler(async ({ event, context }) => {
  const { user } = event.params;

  context.log.info(`✅ Account unflagged: ${user}`);
});

MusicSubscriptionV5.VoteToFlag.handler(async ({ event, context }) => {
  const { voter, target, totalVotes } = event.params;

  context.log.info(`🗳️ Vote to flag: ${voter} voted to flag ${target} (total votes: ${totalVotes})`);
});

// ============================================
// LIVE RADIO EVENTS (World Cup 2026 Jukebox)
// ============================================

// Radio lifecycle events
LiveRadioV3.RadioStarted.handler(async ({ event, context }) => {
  const statsId = `radio-stats-${event.chainId}`;

  let stats = await context.RadioGlobalStats.get(statsId);
  if (!stats) {
    stats = {
      id: statsId,
      isLive: true,
      totalSongsPlayed: 0,
      totalQueuedSongs: 0,
      totalRandomSongs: 0,
      totalVoiceNotes: 0,
      totalListeners: 0,
      totalTipsWMON: BigInt(0),
      totalRewardsPaidTOURS: BigInt(0),
      lastUpdated: new Date(event.block.timestamp * 1000),
    };
  } else {
    stats = {
      ...stats,
      isLive: true,
      lastUpdated: new Date(event.block.timestamp * 1000),
    };
  }

  await context.RadioGlobalStats.set(stats);
  context.log.info(`📻 LiveRadio started at ${event.block.timestamp}`);
});

LiveRadioV3.RadioStopped.handler(async ({ event, context }) => {
  const statsId = `radio-stats-${event.chainId}`;

  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      isLive: false,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`📻 LiveRadio stopped at ${event.block.timestamp}`);
});

// Song queuing
LiveRadioV3.SongQueued.handler(async ({ event, context }) => {
  const { queueId, masterTokenId, queuedBy, fid, paidAmount, tipAmount, hadLicense } = event.params;

  const queuedSongId = `queue-${event.chainId}-${queueId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.RadioQueuedSong.set({
    id: queuedSongId,
    queueId: queueId.toString(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
    queuedBy: queuedBy.toLowerCase(),
    queuedByFid: fid.toString(),
    paidAmount: paidAmount,
    tipAmount: tipAmount,
    hadLicense: hadLicense,
    played: false,
    queuedAt: timestamp,
    playedAt: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update listener stats
  const listenerId = `listener-${event.chainId}-${queuedBy.toLowerCase()}`;
  let listener = await context.RadioListener.get(listenerId);
  if (!listener) {
    listener = {
      id: listenerId,
      listener: queuedBy.toLowerCase(),
      totalSongsListened: 0,
      totalRewardsEarned: BigInt(0),
      currentStreak: 0,
      longestStreak: 0,
      firstListenerBonuses: 0,
      voiceNotesSubmitted: 0,
      voiceNotesPlayed: 0,
      tipsGiven: BigInt(0),
      songsQueued: 1,
      lastActiveAt: timestamp,
    };
  } else {
    listener = {
      ...listener,
      songsQueued: listener.songsQueued + 1,
      tipsGiven: listener.tipsGiven + tipAmount,
      lastActiveAt: timestamp,
    };
  }
  await context.RadioListener.set(listener);

  // Update global stats
  const statsId = `radio-stats-${event.chainId}`;
  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      totalQueuedSongs: stats.totalQueuedSongs + 1,
      totalTipsWMON: stats.totalTipsWMON + tipAmount,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎵 Song #${masterTokenId} queued by ${queuedBy.slice(0, 8)}... (FID: ${fid}, paid: ${paidAmount})`);
});

// Song played (tracks all plays - queued and random)
LiveRadioV3.SongPlayed.handler(async ({ event, context }) => {
  const { queueId, masterTokenId, artist, artistPayout, wasRandom } = event.params;

  const playId = `play-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create play record
  await context.RadioPlay.set({
    id: playId,
    queueId: queueId.toString(),
    masterTokenId: masterTokenId.toString(),
    masterToken_id: `music-${event.chainId}-${masterTokenId.toString()}`,
    artist: artist.toLowerCase(),
    artistPayout: artistPayout,
    wasRandom: wasRandom,
    playedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Mark queued song as played if it was queued
  if (queueId > BigInt(0)) {
    const queuedSongId = `queue-${event.chainId}-${queueId.toString()}`;
    const queuedSong = await context.RadioQueuedSong.get(queuedSongId);
    if (queuedSong) {
      await context.RadioQueuedSong.set({
        ...queuedSong,
        played: true,
        playedAt: timestamp,
      });
    }
  }

  // Update global stats
  const statsId = `radio-stats-${event.chainId}`;
  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      totalSongsPlayed: stats.totalSongsPlayed + 1,
      totalRandomSongs: wasRandom ? stats.totalRandomSongs + 1 : stats.totalRandomSongs,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎶 Song #${masterTokenId} played on radio (${wasRandom ? 'random' : 'queued'}) - artist: ${artist.slice(0, 8)}...`);
});

// Voice notes
LiveRadioV3.VoiceNoteSubmitted.handler(async ({ event, context }) => {
  const { noteId, submitter, duration, paidAmount, isAd } = event.params;

  const voiceNoteId = `voicenote-${event.chainId}-${noteId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.RadioVoiceNote.set({
    id: voiceNoteId,
    noteId: noteId.toString(),
    submitter: submitter.toLowerCase(),
    duration: duration,
    paidAmount: paidAmount,
    isAd: isAd,
    played: false,
    rewardPaid: undefined,
    submittedAt: timestamp,
    playedAt: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update listener stats
  const listenerId = `listener-${event.chainId}-${submitter.toLowerCase()}`;
  let listener = await context.RadioListener.get(listenerId);
  if (!listener) {
    listener = {
      id: listenerId,
      listener: submitter.toLowerCase(),
      totalSongsListened: 0,
      totalRewardsEarned: BigInt(0),
      currentStreak: 0,
      longestStreak: 0,
      firstListenerBonuses: 0,
      voiceNotesSubmitted: 1,
      voiceNotesPlayed: 0,
      tipsGiven: BigInt(0),
      songsQueued: 0,
      lastActiveAt: timestamp,
    };
  } else {
    listener = {
      ...listener,
      voiceNotesSubmitted: listener.voiceNotesSubmitted + 1,
      lastActiveAt: timestamp,
    };
  }
  await context.RadioListener.set(listener);

  // Update global stats
  const statsId = `radio-stats-${event.chainId}`;
  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      totalVoiceNotes: stats.totalVoiceNotes + 1,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎤 Voice ${isAd ? 'ad' : 'note'} submitted by ${submitter.slice(0, 8)}... (${duration}s, paid: ${paidAmount})`);
});

LiveRadioV3.VoiceNotePlayed.handler(async ({ event, context }) => {
  const { noteId, submitter, rewardPaid } = event.params;

  const voiceNoteId = `voicenote-${event.chainId}-${noteId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  const voiceNote = await context.RadioVoiceNote.get(voiceNoteId);
  if (voiceNote) {
    await context.RadioVoiceNote.set({
      ...voiceNote,
      played: true,
      rewardPaid: rewardPaid,
      playedAt: timestamp,
    });
  }

  // Update listener stats
  const listenerId = `listener-${event.chainId}-${submitter.toLowerCase()}`;
  let listener = await context.RadioListener.get(listenerId);
  if (listener) {
    await context.RadioListener.set({
      ...listener,
      voiceNotesPlayed: listener.voiceNotesPlayed + 1,
      totalRewardsEarned: listener.totalRewardsEarned + rewardPaid,
      lastActiveAt: timestamp,
    });
  }

  context.log.info(`🎤 Voice note #${noteId} played - ${submitter.slice(0, 8)}... earned ${rewardPaid} TOURS`);
});

// Listener rewards
LiveRadioV3.ListenerRewarded.handler(async ({ event, context }) => {
  const { listener, amount, rewardType } = event.params;

  const listenerId = `listener-${event.chainId}-${listener.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  let listenerEntity = await context.RadioListener.get(listenerId);
  if (!listenerEntity) {
    listenerEntity = {
      id: listenerId,
      listener: listener.toLowerCase(),
      totalSongsListened: 1,
      totalRewardsEarned: amount,
      currentStreak: 1,
      longestStreak: 1,
      firstListenerBonuses: 0,
      voiceNotesSubmitted: 0,
      voiceNotesPlayed: 0,
      tipsGiven: BigInt(0),
      songsQueued: 0,
      lastActiveAt: timestamp,
    };
  } else {
    listenerEntity = {
      ...listenerEntity,
      totalSongsListened: listenerEntity.totalSongsListened + 1,
      totalRewardsEarned: listenerEntity.totalRewardsEarned + amount,
      lastActiveAt: timestamp,
    };
  }
  await context.RadioListener.set(listenerEntity);

  // Update global stats
  const statsId = `radio-stats-${event.chainId}`;
  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      totalRewardsPaidTOURS: stats.totalRewardsPaidTOURS + amount,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎧 Listener ${listener.slice(0, 8)}... rewarded ${amount} TOURS (${rewardType})`);
});

LiveRadioV3.StreakBonusClaimed.handler(async ({ event, context }) => {
  const { listener, streakDays, bonusAmount } = event.params;

  const listenerId = `listener-${event.chainId}-${listener.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  let listenerEntity = await context.RadioListener.get(listenerId);
  if (listenerEntity) {
    const newLongestStreak = Number(streakDays) > listenerEntity.longestStreak
      ? Number(streakDays)
      : listenerEntity.longestStreak;

    await context.RadioListener.set({
      ...listenerEntity,
      currentStreak: Number(streakDays),
      longestStreak: newLongestStreak,
      totalRewardsEarned: listenerEntity.totalRewardsEarned + bonusAmount,
      lastActiveAt: timestamp,
    });
  }

  context.log.info(`🔥 ${listener.slice(0, 8)}... claimed ${streakDays}-day streak bonus: ${bonusAmount} TOURS`);
});

LiveRadioV3.FirstListenerBonus.handler(async ({ event, context }) => {
  const { listener, day, bonusAmount } = event.params;

  const firstListenerId = `firstlistener-${event.chainId}-${day.toString()}`;
  const listenerId = `listener-${event.chainId}-${listener.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Record first listener for the day
  await context.RadioFirstListener.set({
    id: firstListenerId,
    day: day,
    listener: listener.toLowerCase(),
    bonusAmount: bonusAmount,
    claimedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update listener stats
  let listenerEntity = await context.RadioListener.get(listenerId);
  if (listenerEntity) {
    await context.RadioListener.set({
      ...listenerEntity,
      firstListenerBonuses: listenerEntity.firstListenerBonuses + 1,
      totalRewardsEarned: listenerEntity.totalRewardsEarned + bonusAmount,
      lastActiveAt: timestamp,
    });
  }

  context.log.info(`🌟 ${listener.slice(0, 8)}... is first listener of day ${day} - bonus: ${bonusAmount} TOURS`);
});

// Tips
LiveRadioV3.TipReceived.handler(async ({ event, context }) => {
  const { masterTokenId, artist, tipper, amount } = event.params;

  const tipId = `tip-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.RadioTip.set({
    id: tipId,
    masterTokenId: masterTokenId.toString(),
    artist: artist.toLowerCase(),
    tipper: tipper.toLowerCase(),
    amount: amount,
    tippedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update tipper stats
  const listenerId = `listener-${event.chainId}-${tipper.toLowerCase()}`;
  let listener = await context.RadioListener.get(listenerId);
  if (listener) {
    await context.RadioListener.set({
      ...listener,
      tipsGiven: listener.tipsGiven + amount,
      lastActiveAt: timestamp,
    });
  }

  // Update global stats
  const statsId = `radio-stats-${event.chainId}`;
  let stats = await context.RadioGlobalStats.get(statsId);
  if (stats) {
    await context.RadioGlobalStats.set({
      ...stats,
      totalTipsWMON: stats.totalTipsWMON + amount,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`💸 Tip: ${tipper.slice(0, 8)}... tipped ${amount} WMON to artist ${artist.slice(0, 8)}... for song #${masterTokenId}`);
});

// Random song selection (Pyth Entropy)
LiveRadioV3.RandomSongRequested.handler(async ({ event, context }) => {
  const { sequenceNumber, requester } = event.params;

  context.log.info(`🎲 Random song requested - sequence: ${sequenceNumber}, requester: ${requester.slice(0, 8)}...`);
});

LiveRadioV3.RandomSongSelected.handler(async ({ event, context }) => {
  const { masterTokenId, randomValue } = event.params;

  context.log.info(`🎲 Random song selected: #${masterTokenId} (random: ${randomValue})`);
});

// Song pool management
LiveRadioV3.SongAddedToPool.handler(async ({ event, context }) => {
  const { masterTokenId } = event.params;

  context.log.info(`➕ Song #${masterTokenId} added to radio pool`);
});

LiveRadioV3.SongRemovedFromPool.handler(async ({ event, context }) => {
  const { masterTokenId } = event.params;

  context.log.info(`➖ Song #${masterTokenId} removed from radio pool`);
});

// ============================================
// CLIMBING LOCATIONS V1 EVENTS (Rock Climbing)
// ============================================

ClimbingLocationsV2.LocationCreated.handler(async ({ event, context }) => {
  const { locationId, creator, creatorFid, creatorTelegramId, name, photoProofIPFS, priceWmon } = event.params;

  const climbLocationId = `location-${event.chainId}-${locationId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create climb location entity
  await context.ClimbLocation.set({
    id: climbLocationId,
    locationId: locationId.toString(),
    creator: creator.toLowerCase(),
    creatorFid: creatorFid > BigInt(0) ? creatorFid.toString() : undefined,
    creatorTelegramId: creatorTelegramId > BigInt(0) ? creatorTelegramId.toString() : undefined,
    name: name,
    difficulty: undefined,
    latitude: undefined,
    longitude: undefined,
    photoProofIPFS: photoProofIPFS,
    description: undefined,
    priceWmon: priceWmon,
    isActive: true,
    isDisabled: false,
    totalPurchases: 0,
    totalClimbs: 0,
    createdAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update climber stats
  const climberId = `climber-${event.chainId}-${creator.toLowerCase()}`;
  let climberStats = await context.ClimberStats.get(climberId);

  if (climberStats) {
    await context.ClimberStats.set({
      ...climberStats,
      locationsCreated: climberStats.locationsCreated + 1,
    });
  } else {
    await context.ClimberStats.set({
      id: climberId,
      climber: creator.toLowerCase(),
      locationsCreated: 1,
      locationsPurchased: 0,
      totalClimbs: 0,
      totalToursEarned: BigInt(0),
      lastClimbAt: undefined,
    });
  }

  // Update global climbing stats
  const globalStatsId = `climbing-stats-${event.chainId}`;
  let globalStats = await context.ClimbingGlobalStats.get(globalStatsId);

  if (globalStats) {
    await context.ClimbingGlobalStats.set({
      ...globalStats,
      totalLocations: globalStats.totalLocations + 1,
      totalWmonCollected: globalStats.totalWmonCollected + BigInt(35) * BigInt(10 ** 18), // 35 WMON creation fee
      lastUpdated: timestamp,
    });
  } else {
    await context.ClimbingGlobalStats.set({
      id: globalStatsId,
      totalLocations: 1,
      totalAccessBadges: 0,
      totalClimbProofs: 0,
      totalToursDistributed: BigInt(0),
      totalWmonCollected: BigInt(35) * BigInt(10 ** 18),
      lastUpdated: timestamp,
    });
  }

  const userType = creatorFid > BigInt(0) ? `FID: ${creatorFid}` : `TG: ${creatorTelegramId}`;
  context.log.info(`🧗 Climb location #${locationId} created by ${creator.slice(0, 8)}... (${userType}) - "${name}" @ ${priceWmon} WMON`);
});

ClimbingLocationsV2.AccessBadgeMinted.handler(async ({ event, context }) => {
  const { tokenId, locationId, holder, holderFid, holderTelegramId } = event.params;

  const badgeId = `badge-${event.chainId}-${tokenId.toString()}`;
  const climbLocationId = `location-${event.chainId}-${locationId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create access badge entity
  await context.ClimbAccessBadge.set({
    id: badgeId,
    tokenId: tokenId.toString(),
    location_id: climbLocationId,
    locationId: locationId.toString(),
    holder: holder.toLowerCase(),
    holderFid: holderFid > BigInt(0) ? holderFid.toString() : undefined,
    holderTelegramId: holderTelegramId > BigInt(0) ? holderTelegramId.toString() : undefined,
    purchasedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update location purchase count
  const location = await context.ClimbLocation.get(climbLocationId);
  if (location) {
    await context.ClimbLocation.set({
      ...location,
      totalPurchases: location.totalPurchases + 1,
    });
  }

  // Update climber stats
  const climberId = `climber-${event.chainId}-${holder.toLowerCase()}`;
  let climberStats = await context.ClimberStats.get(climberId);

  if (climberStats) {
    await context.ClimberStats.set({
      ...climberStats,
      locationsPurchased: climberStats.locationsPurchased + 1,
    });
  } else {
    await context.ClimberStats.set({
      id: climberId,
      climber: holder.toLowerCase(),
      locationsCreated: 0,
      locationsPurchased: 1,
      totalClimbs: 0,
      totalToursEarned: BigInt(0),
      lastClimbAt: undefined,
    });
  }

  // Update global climbing stats
  const globalStatsId = `climbing-stats-${event.chainId}`;
  let globalStats = await context.ClimbingGlobalStats.get(globalStatsId);

  if (globalStats) {
    await context.ClimbingGlobalStats.set({
      ...globalStats,
      totalAccessBadges: globalStats.totalAccessBadges + 1,
      lastUpdated: timestamp,
    });
  }

  const userType = holderFid > BigInt(0) ? `FID: ${holderFid}` : `TG: ${holderTelegramId}`;
  context.log.info(`🎫 Access Badge #${tokenId} minted for location #${locationId} to ${holder.slice(0, 8)}... (${userType})`);
});

ClimbingLocationsV2.ClimbProofMinted.handler(async ({ event, context }) => {
  const { tokenId, locationId, climber, photoIPFS, reward } = event.params;

  const proofId = `proof-${event.chainId}-${tokenId.toString()}`;
  const climbLocationId = `location-${event.chainId}-${locationId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create climb proof entity
  await context.ClimbProof.set({
    id: proofId,
    tokenId: tokenId.toString(),
    location_id: climbLocationId,
    locationId: locationId.toString(),
    climber: climber.toLowerCase(),
    photoIPFS: photoIPFS,
    entryText: undefined,
    reward: reward,
    climbedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update location climb count
  const location = await context.ClimbLocation.get(climbLocationId);
  if (location) {
    await context.ClimbLocation.set({
      ...location,
      totalClimbs: location.totalClimbs + 1,
    });
  }

  // Update climber stats
  const climberId = `climber-${event.chainId}-${climber.toLowerCase()}`;
  let climberStats = await context.ClimberStats.get(climberId);

  if (climberStats) {
    await context.ClimberStats.set({
      ...climberStats,
      totalClimbs: climberStats.totalClimbs + 1,
      totalToursEarned: climberStats.totalToursEarned + reward,
      lastClimbAt: timestamp,
    });
  } else {
    await context.ClimberStats.set({
      id: climberId,
      climber: climber.toLowerCase(),
      locationsCreated: 0,
      locationsPurchased: 0,
      totalClimbs: 1,
      totalToursEarned: reward,
      lastClimbAt: timestamp,
    });
  }

  // Update global climbing stats
  const globalStatsId = `climbing-stats-${event.chainId}`;
  let globalStats = await context.ClimbingGlobalStats.get(globalStatsId);

  if (globalStats) {
    await context.ClimbingGlobalStats.set({
      ...globalStats,
      totalClimbProofs: globalStats.totalClimbProofs + 1,
      totalToursDistributed: globalStats.totalToursDistributed + reward,
      lastUpdated: timestamp,
    });
  }

  const rewardFormatted = (Number(reward) / 1e18).toFixed(2);
  context.log.info(`🏆 Climb Proof #${tokenId} minted for location #${locationId} - ${climber.slice(0, 8)}... earned ${rewardFormatted} TOURS`);
});

ClimbingLocationsV2.LocationDisabled.handler(async ({ event, context }) => {
  const { locationId } = event.params;

  const climbLocationId = `location-${event.chainId}-${locationId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  const location = await context.ClimbLocation.get(climbLocationId);
  if (location) {
    await context.ClimbLocation.set({
      ...location,
      isDisabled: true,
      isActive: false,
    });
  }

  context.log.info(`🚫 Climb location #${locationId} disabled by admin`);
});

// ============================================
// TOURS REWARD MANAGER EVENTS (Bitcoin-style Halving)
// ============================================

ToursRewardManager.HalvingTriggered.handler(async ({ event, context }) => {
  const { epoch, timestamp } = event.params;

  const epochId = `epoch-${event.chainId}-${epoch.toString()}`;

  await context.RewardEpoch.set({
    id: epochId,
    epoch: epoch.toString(),
    triggeredBy: undefined,
    isEarlyHalving: false,
    triggeredAt: new Date(Number(timestamp) * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  const configId = `reward-config-${event.chainId}`;
  let config = await context.RewardManagerConfig.get(configId);
  if (config) {
    await context.RewardManagerConfig.set({
      ...config,
      currentEpoch: Number(epoch),
      lastUpdated: new Date(Number(timestamp) * 1000),
    });
  } else {
    await context.RewardManagerConfig.set({
      id: configId,
      currentEpoch: Number(epoch),
      dailyCap: BigInt(0),
      daoTimelock: undefined,
      lastUpdated: new Date(Number(timestamp) * 1000),
    });
  }

  context.log.info(`⚡ Halving triggered - Epoch ${epoch}`);
});

ToursRewardManager.EarlyHalvingTriggered.handler(async ({ event, context }) => {
  const { newEpoch, triggeredBy } = event.params;

  const epochId = `epoch-${event.chainId}-${newEpoch.toString()}`;

  await context.RewardEpoch.set({
    id: epochId,
    epoch: newEpoch.toString(),
    triggeredBy: triggeredBy.toLowerCase(),
    isEarlyHalving: true,
    triggeredAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  const configId = `reward-config-${event.chainId}`;
  let config = await context.RewardManagerConfig.get(configId);
  if (config) {
    await context.RewardManagerConfig.set({
      ...config,
      currentEpoch: Number(newEpoch),
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`⚡ Early halving triggered to epoch ${newEpoch} by ${triggeredBy}`);
});

ToursRewardManager.BaseRewardUpdated.handler(async ({ event, context }) => {
  const { rewardType, oldRate, newRate } = event.params;

  const updateId = `rate-update-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.RewardRateUpdate.set({
    id: updateId,
    rewardType: Number(rewardType),
    oldRate: oldRate,
    newRate: newRate,
    isOverride: false,
    updatedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`📊 Base reward updated - Type ${rewardType}: ${oldRate} → ${newRate}`);
});

ToursRewardManager.OverrideSet.handler(async ({ event, context }) => {
  const { rewardType, rate } = event.params;

  const updateId = `override-set-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.RewardRateUpdate.set({
    id: updateId,
    rewardType: Number(rewardType),
    oldRate: BigInt(0),
    newRate: rate,
    isOverride: true,
    updatedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🔧 Override set - Type ${rewardType}: ${rate}`);
});

ToursRewardManager.OverrideCleared.handler(async ({ event, context }) => {
  const { rewardType } = event.params;

  context.log.info(`🔧 Override cleared for reward type ${rewardType}`);
});

ToursRewardManager.DistributorUpdated.handler(async ({ event, context }) => {
  const { distributor, authorized } = event.params;

  context.log.info(`${authorized ? '✅' : '❌'} Distributor ${distributor} ${authorized ? 'authorized' : 'revoked'}`);
});

ToursRewardManager.DailyCapUpdated.handler(async ({ event, context }) => {
  const { oldCap, newCap } = event.params;

  const configId = `reward-config-${event.chainId}`;
  let config = await context.RewardManagerConfig.get(configId);
  if (config) {
    await context.RewardManagerConfig.set({
      ...config,
      dailyCap: newCap,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`📊 Daily cap updated: ${oldCap} → ${newCap}`);
});

ToursRewardManager.DAOTimelockUpdated.handler(async ({ event, context }) => {
  const { oldTimelock, newTimelock } = event.params;

  const configId = `reward-config-${event.chainId}`;
  let config = await context.RewardManagerConfig.get(configId);
  if (config) {
    await context.RewardManagerConfig.set({
      ...config,
      daoTimelock: newTimelock.toLowerCase(),
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🏛️ DAO Timelock updated: ${oldTimelock} → ${newTimelock}`);
});

ToursRewardManager.RewardDistributed.handler(async ({ event, context }) => {
  const { recipient, rewardType, amount } = event.params;

  const distId = `tours-reward-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.ToursRewardDistribution.set({
    id: distId,
    recipient: recipient.toLowerCase(),
    rewardType: Number(rewardType),
    amount: amount,
    distributedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  const amountFormatted = (Number(amount) / 1e18).toFixed(2);
  context.log.info(`🎁 Reward distributed: ${recipient.slice(0, 8)}... received ${amountFormatted} TOURS (type: ${rewardType})`);
});

// ============================================
// VOTING TOURS EVENTS (vTOURS Governance Token)
// ============================================

VotingTOURS.Transfer.handler(async ({ event, context }) => {
  const { from, to, value } = event.params;

  const transferId = `vtours-transfer-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const ZERO = "0x0000000000000000000000000000000000000000";
  const isWrap = from === ZERO;
  const isUnwrap = to === ZERO;

  await context.VotingTOURSTransfer.set({
    id: transferId,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    value: value,
    isWrap: isWrap,
    isUnwrap: isUnwrap,
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  if (isWrap) {
    context.log.info(`🗳️ vTOURS wrapped: ${to.slice(0, 8)}... wrapped ${value} TOURS → vTOURS`);
  } else if (isUnwrap) {
    context.log.info(`🗳️ vTOURS unwrapped: ${from.slice(0, 8)}... unwrapped ${value} vTOURS → TOURS`);
  } else {
    context.log.info(`🗳️ vTOURS transferred: ${from.slice(0, 8)}... → ${to.slice(0, 8)}... (${value})`);
  }
});

VotingTOURS.DelegateChanged.handler(async ({ event, context }) => {
  const { delegator, fromDelegate, toDelegate } = event.params;

  const delegateId = `delegate-${event.chainId}-${delegator.toLowerCase()}`;

  await context.VotingDelegate.set({
    id: delegateId,
    delegator: delegator.toLowerCase(),
    currentDelegate: toDelegate.toLowerCase(),
    previousDelegate: fromDelegate.toLowerCase(),
    lastDelegatedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🗳️ Delegation changed: ${delegator.slice(0, 8)}... delegated to ${toDelegate.slice(0, 8)}...`);
});

VotingTOURS.DelegateVotesChanged.handler(async ({ event, context }) => {
  const { delegate, previousVotes, newVotes } = event.params;

  const powerId = `voting-power-${event.chainId}-${delegate.toLowerCase()}`;

  await context.VotingPower.set({
    id: powerId,
    delegate: delegate.toLowerCase(),
    currentVotes: newVotes,
    previousVotes: previousVotes,
    lastUpdatedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🗳️ Voting power changed: ${delegate.slice(0, 8)}... ${previousVotes} → ${newVotes}`);
});

// ============================================
// EMPOWER TOURS GOVERNOR EVENTS (DAO Proposals)
// ============================================

EmpowerToursGovernor.ProposalCreated.handler(async ({ event, context }) => {
  const { proposalId, proposer, targets, values, signatures, calldatas, voteStart, voteEnd, description } = event.params;

  const proposalEntityId = `proposal-${event.chainId}-${proposalId.toString()}`;

  await context.GovernorProposal.set({
    id: proposalEntityId,
    proposalId: proposalId.toString(),
    proposer: proposer.toLowerCase(),
    description: description,
    voteStart: voteStart,
    voteEnd: voteEnd,
    status: "Pending",
    etaSeconds: undefined,
    totalForVotes: BigInt(0),
    totalAgainstVotes: BigInt(0),
    totalAbstainVotes: BigInt(0),
    voteCount: 0,
    createdAt: new Date(event.block.timestamp * 1000),
    executedAt: undefined,
    cancelledAt: undefined,
    queuedAt: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`🏛️ Proposal #${proposalId} created by ${proposer.slice(0, 8)}... - "${description.slice(0, 80)}..."`);
});

EmpowerToursGovernor.VoteCast.handler(async ({ event, context }) => {
  const { voter, proposalId, support, weight, reason } = event.params;

  const voteId = `vote-${event.chainId}-${proposalId.toString()}-${voter.toLowerCase()}`;
  const proposalEntityId = `proposal-${event.chainId}-${proposalId.toString()}`;

  await context.GovernorVote.set({
    id: voteId,
    proposal_id: proposalEntityId,
    proposalId: proposalId.toString(),
    voter: voter.toLowerCase(),
    support: Number(support),
    weight: weight,
    reason: reason || undefined,
    votedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update proposal vote tallies
  const proposal = await context.GovernorProposal.get(proposalEntityId);
  if (proposal) {
    const update: any = {
      ...proposal,
      voteCount: proposal.voteCount + 1,
      status: "Active",
    };
    if (Number(support) === 0) update.totalAgainstVotes = proposal.totalAgainstVotes + weight;
    else if (Number(support) === 1) update.totalForVotes = proposal.totalForVotes + weight;
    else if (Number(support) === 2) update.totalAbstainVotes = proposal.totalAbstainVotes + weight;

    await context.GovernorProposal.set(update);
  }

  const supportLabel = Number(support) === 0 ? "Against" : Number(support) === 1 ? "For" : "Abstain";
  context.log.info(`🗳️ Vote cast on Proposal #${proposalId}: ${voter.slice(0, 8)}... voted ${supportLabel} (weight: ${weight})`);
});

EmpowerToursGovernor.ProposalQueued.handler(async ({ event, context }) => {
  const { proposalId, etaSeconds } = event.params;

  const proposalEntityId = `proposal-${event.chainId}-${proposalId.toString()}`;
  const proposal = await context.GovernorProposal.get(proposalEntityId);

  if (proposal) {
    await context.GovernorProposal.set({
      ...proposal,
      status: "Queued",
      etaSeconds: etaSeconds,
      queuedAt: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🏛️ Proposal #${proposalId} queued - ETA: ${new Date(Number(etaSeconds) * 1000).toISOString()}`);
});

EmpowerToursGovernor.ProposalExecuted.handler(async ({ event, context }) => {
  const { proposalId } = event.params;

  const proposalEntityId = `proposal-${event.chainId}-${proposalId.toString()}`;
  const proposal = await context.GovernorProposal.get(proposalEntityId);

  if (proposal) {
    await context.GovernorProposal.set({
      ...proposal,
      status: "Executed",
      executedAt: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`✅ Proposal #${proposalId} executed`);
});

EmpowerToursGovernor.ProposalCanceled.handler(async ({ event, context }) => {
  const { proposalId } = event.params;

  const proposalEntityId = `proposal-${event.chainId}-${proposalId.toString()}`;
  const proposal = await context.GovernorProposal.get(proposalEntityId);

  if (proposal) {
    await context.GovernorProposal.set({
      ...proposal,
      status: "Canceled",
      cancelledAt: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`❌ Proposal #${proposalId} canceled`);
});

// ============================================
// EMPOWER TOURS TIMELOCK EVENTS
// ============================================

EmpowerToursTimelock.CallScheduled.handler(async ({ event, context }) => {
  const { id, index, target, value, data, predecessor, delay } = event.params;

  const opId = `timelock-${event.chainId}-${id}-${index.toString()}`;

  await context.TimelockOperation.set({
    id: opId,
    operationId: id,
    index: index,
    target: target.toLowerCase(),
    value: value,
    data: data,
    predecessor: predecessor,
    delay: delay,
    status: "Scheduled",
    scheduledAt: new Date(event.block.timestamp * 1000),
    executedAt: undefined,
    cancelledAt: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`⏰ Timelock call scheduled: ${target.slice(0, 8)}... (delay: ${delay}s)`);
});

EmpowerToursTimelock.CallExecuted.handler(async ({ event, context }) => {
  const { id, index, target, value, data } = event.params;

  const opId = `timelock-${event.chainId}-${id}-${index.toString()}`;
  const existing = await context.TimelockOperation.get(opId);

  if (existing) {
    await context.TimelockOperation.set({
      ...existing,
      status: "Executed",
      executedAt: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.TimelockOperation.set({
      id: opId,
      operationId: id,
      index: index,
      target: target.toLowerCase(),
      value: value,
      data: data,
      predecessor: undefined,
      delay: undefined,
      status: "Executed",
      scheduledAt: undefined,
      executedAt: new Date(event.block.timestamp * 1000),
      cancelledAt: undefined,
      blockNumber: BigInt(event.block.number),
      txHash: event.transaction.hash,
    });
  }

  context.log.info(`✅ Timelock call executed: ${target.slice(0, 8)}...`);
});

EmpowerToursTimelock.Cancelled.handler(async ({ event, context }) => {
  const { id } = event.params;

  const cancelId = `timelock-cancel-${event.chainId}-${id}`;

  await context.TimelockOperation.set({
    id: cancelId,
    operationId: id,
    index: BigInt(0),
    target: "",
    value: BigInt(0),
    data: "",
    predecessor: undefined,
    delay: undefined,
    status: "Cancelled",
    scheduledAt: undefined,
    executedAt: undefined,
    cancelledAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`❌ Timelock operation cancelled: ${id}`);
});

// ============================================
// DAO CONTRACT FACTORY EVENTS
// ============================================

DAOContractFactory.ProposalRegistered.handler(async ({ event, context }) => {
  const { id, proposer, prompt, treasuryAllocation } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;

  await context.FactoryProposal.set({
    id: proposalId,
    proposalId: id.toString(),
    proposer: proposer.toLowerCase(),
    prompt: prompt,
    treasuryAllocation: treasuryAllocation,
    governorProposalId: undefined,
    ipfsCID: undefined,
    bytecodeCompiled: false,
    deployedContract: undefined,
    deploymentNFTId: undefined,
    sourceHash: undefined,
    bytecodeHash: undefined,
    rewardAmount: undefined,
    status: "Registered",
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`📋 Factory Proposal #${id} registered by ${proposer.slice(0, 8)}... - "${prompt.slice(0, 60)}..."`);
});

DAOContractFactory.GovernorProposalLinked.handler(async ({ event, context }) => {
  const { id, governorProposalId } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);

  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      governorProposalId: governorProposalId.toString(),
    });
  }

  context.log.info(`🔗 Factory Proposal #${id} linked to Governor Proposal #${governorProposalId}`);
});

DAOContractFactory.CodeGenerated.handler(async ({ event, context }) => {
  const { id, ipfsCID } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);

  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      ipfsCID: ipfsCID,
      status: "CodeGenerated",
    });
  }

  context.log.info(`💻 Code generated for Factory Proposal #${id} - IPFS: ${ipfsCID}`);
});

DAOContractFactory.BytecodeCompiled.handler(async ({ event, context }) => {
  const { id } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);

  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      bytecodeCompiled: true,
      status: "Compiled",
    });
  }

  context.log.info(`🔨 Bytecode compiled for Factory Proposal #${id}`);
});

DAOContractFactory.ContractDeployed.handler(async ({ event, context }) => {
  const { id, deployedContract, nftId } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);

  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      deployedContract: deployedContract.toLowerCase(),
      deploymentNFTId: nftId.toString(),
      status: "Deployed",
    });
  }

  context.log.info(`🚀 Contract deployed for Factory Proposal #${id} at ${deployedContract} (NFT #${nftId})`);
});

DAOContractFactory.TreasuryAllocated.handler(async ({ event, context }) => {
  const { id, recipient, amount } = event.params;

  const allocationId = `treasury-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.FactoryTreasuryAllocation.set({
    id: allocationId,
    proposalId: id.toString(),
    recipient: recipient.toLowerCase(),
    amount: amount,
    allocatedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  const amountFormatted = (Number(amount) / 1e18).toFixed(2);
  context.log.info(`💰 Treasury allocated for Proposal #${id}: ${amountFormatted} TOURS to ${recipient.slice(0, 8)}...`);
});

DAOContractFactory.RewardDistributed.handler(async ({ event, context }) => {
  const { id, proposer, amount } = event.params;

  const rewardId = `factory-reward-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;

  await context.FactoryRewardDistribution.set({
    id: rewardId,
    proposalId: id.toString(),
    proposer: proposer.toLowerCase(),
    amount: amount,
    distributedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);
  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      rewardAmount: amount,
    });
  }

  const amountFormatted = (Number(amount) / 1e18).toFixed(2);
  context.log.info(`🎁 Factory reward for Proposal #${id}: ${amountFormatted} TOURS to ${proposer.slice(0, 8)}...`);
});

DAOContractFactory.IntegrityHashesSet.handler(async ({ event, context }) => {
  const { id, sourceHash, bytecodeHash } = event.params;

  const proposalId = `factory-${event.chainId}-${id.toString()}`;
  const proposal = await context.FactoryProposal.get(proposalId);

  if (proposal) {
    await context.FactoryProposal.set({
      ...proposal,
      sourceHash: sourceHash,
      bytecodeHash: bytecodeHash,
    });
  }

  context.log.info(`🔐 Integrity hashes set for Proposal #${id}`);
});

DAOContractFactory.ProposalFeeUpdated.handler(async ({ event, context }) => {
  const { oldFee, newFee } = event.params;

  context.log.info(`💰 Factory proposal fee updated: ${oldFee} → ${newFee}`);
});

// ============================================
// DEPLOYMENT NFT EVENTS
// ============================================

DeploymentNFT.DeploymentRecorded.handler(async ({ event, context }) => {
  const { tokenId, proposalId, deployedContract, ipfsCodeHash } = event.params;

  const nftId = `deployment-nft-${event.chainId}-${tokenId.toString()}`;

  await context.DeploymentNFTToken.set({
    id: nftId,
    tokenId: tokenId.toString(),
    proposalId: proposalId.toString(),
    deployedContract: deployedContract.toLowerCase(),
    ipfsCodeHash: ipfsCodeHash,
    owner: "",
    mintedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  context.log.info(`📜 Deployment NFT #${tokenId} recorded for Proposal #${proposalId} → ${deployedContract}`);
});

DeploymentNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  const nftId = `deployment-nft-${event.chainId}-${tokenId.toString()}`;
  const existing = await context.DeploymentNFTToken.get(nftId);

  if (existing) {
    await context.DeploymentNFTToken.set({
      ...existing,
      owner: to.toLowerCase(),
    });
  }

  const ZERO = "0x0000000000000000000000000000000000000000";
  if (from === ZERO) {
    context.log.info(`📜 Deployment NFT #${tokenId} minted to ${to.slice(0, 8)}...`);
  } else {
    context.log.info(`📜 Deployment NFT #${tokenId} transferred: ${from.slice(0, 8)}... → ${to.slice(0, 8)}...`);
  }
});

// ============================================
// EMPOWER TOURS DEV STUDIO EVENTS
// ============================================

EmpowerToursDevStudio.CreditsPurchased.handler(async ({ event, context }) => {
  const { user, amount, cost } = event.params;

  const purchaseId = `credit-purchase-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const userId = `dev-user-${event.chainId}-${user.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.DevStudioCreditPurchase.set({
    id: purchaseId,
    user: user.toLowerCase(),
    amount: amount,
    cost: cost,
    purchasedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  let userStats = await context.DevStudioUser.get(userId);
  if (userStats) {
    await context.DevStudioUser.set({
      ...userStats,
      totalCredits: userStats.totalCredits + amount,
      totalSpent: userStats.totalSpent + cost,
      lastActive: timestamp,
    });
  } else {
    await context.DevStudioUser.set({
      id: userId,
      user: user.toLowerCase(),
      totalCredits: amount,
      totalSpent: cost,
      appsGenerated: 0,
      whitelistMinted: false,
      airdropReceived: BigInt(0),
      lastActive: timestamp,
    });
  }

  const globalId = `dev-studio-stats-${event.chainId}`;
  let globalStats = await context.DevStudioGlobalStats.get(globalId);
  if (globalStats) {
    await context.DevStudioGlobalStats.set({
      ...globalStats,
      totalCreditsPurchased: globalStats.totalCreditsPurchased + amount,
      lastUpdated: timestamp,
    });
  } else {
    await context.DevStudioGlobalStats.set({
      id: globalId,
      totalCreditsPurchased: amount,
      totalAppsGenerated: 0,
      totalWhitelistMints: 0,
      totalAirdrops: BigInt(0),
      whitelistOpen: true,
      lastUpdated: timestamp,
    });
  }

  const costFormatted = (Number(cost) / 1e18).toFixed(2);
  context.log.info(`💳 Credits purchased: ${user.slice(0, 8)}... bought ${amount} credits for ${costFormatted} TOURS`);
});

EmpowerToursDevStudio.PromptGenerated.handler(async ({ event, context }) => {
  const { user, tokenId, appType } = event.params;

  const appId = `dev-app-${event.chainId}-${tokenId.toString()}`;
  const userId = `dev-user-${event.chainId}-${user.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.DevStudioApp.set({
    id: appId,
    tokenId: tokenId.toString(),
    creator: user.toLowerCase(),
    appType: appType,
    createdAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  let userStats = await context.DevStudioUser.get(userId);
  if (userStats) {
    await context.DevStudioUser.set({
      ...userStats,
      appsGenerated: userStats.appsGenerated + 1,
      lastActive: timestamp,
    });
  }

  const globalId = `dev-studio-stats-${event.chainId}`;
  let globalStats = await context.DevStudioGlobalStats.get(globalId);
  if (globalStats) {
    await context.DevStudioGlobalStats.set({
      ...globalStats,
      totalAppsGenerated: globalStats.totalAppsGenerated + 1,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🤖 App generated: ${user.slice(0, 8)}... created "${appType}" app (NFT #${tokenId})`);
});

EmpowerToursDevStudio.WhitelistMinted.handler(async ({ event, context }) => {
  const { user, tokenId, timestamp: eventTimestamp } = event.params;

  const mintId = `whitelist-mint-${event.chainId}-${tokenId.toString()}`;
  const userId = `dev-user-${event.chainId}-${user.toLowerCase()}`;
  const timestamp = new Date(Number(eventTimestamp) * 1000);

  await context.DevStudioWhitelistMint.set({
    id: mintId,
    user: user.toLowerCase(),
    tokenId: tokenId.toString(),
    mintedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  let userStats = await context.DevStudioUser.get(userId);
  if (userStats) {
    await context.DevStudioUser.set({
      ...userStats,
      whitelistMinted: true,
      lastActive: timestamp,
    });
  } else {
    await context.DevStudioUser.set({
      id: userId,
      user: user.toLowerCase(),
      totalCredits: BigInt(0),
      totalSpent: BigInt(0),
      appsGenerated: 0,
      whitelistMinted: true,
      airdropReceived: BigInt(0),
      lastActive: timestamp,
    });
  }

  const globalId = `dev-studio-stats-${event.chainId}`;
  let globalStats = await context.DevStudioGlobalStats.get(globalId);
  if (globalStats) {
    await context.DevStudioGlobalStats.set({
      ...globalStats,
      totalWhitelistMints: globalStats.totalWhitelistMints + 1,
      lastUpdated: timestamp,
    });
  }

  context.log.info(`🎫 Whitelist minted: ${user.slice(0, 8)}... received NFT #${tokenId}`);
});

EmpowerToursDevStudio.ToursAirdropped.handler(async ({ event, context }) => {
  const { user, amount } = event.params;

  const airdropId = `airdrop-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const userId = `dev-user-${event.chainId}-${user.toLowerCase()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.DevStudioAirdrop.set({
    id: airdropId,
    user: user.toLowerCase(),
    amount: amount,
    airdroppedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  let userStats = await context.DevStudioUser.get(userId);
  if (userStats) {
    await context.DevStudioUser.set({
      ...userStats,
      airdropReceived: userStats.airdropReceived + amount,
      lastActive: timestamp,
    });
  }

  const globalId = `dev-studio-stats-${event.chainId}`;
  let globalStats = await context.DevStudioGlobalStats.get(globalId);
  if (globalStats) {
    await context.DevStudioGlobalStats.set({
      ...globalStats,
      totalAirdrops: globalStats.totalAirdrops + amount,
      lastUpdated: timestamp,
    });
  }

  const amountFormatted = (Number(amount) / 1e18).toFixed(2);
  context.log.info(`🪂 TOURS airdropped: ${user.slice(0, 8)}... received ${amountFormatted} TOURS`);
});

EmpowerToursDevStudio.WhitelistClosed.handler(async ({ event, context }) => {
  const { finalCount, timestamp: eventTimestamp } = event.params;

  const globalId = `dev-studio-stats-${event.chainId}`;
  let globalStats = await context.DevStudioGlobalStats.get(globalId);
  if (globalStats) {
    await context.DevStudioGlobalStats.set({
      ...globalStats,
      whitelistOpen: false,
      lastUpdated: new Date(Number(eventTimestamp) * 1000),
    });
  }

  context.log.info(`🔒 Dev Studio whitelist closed - Final count: ${finalCount}`);
});

// ============================================
// DAILY LOTTERY EVENTS (Pyth Entropy Randomness)
// ============================================

DailyLottery.RoundStarted.handler(async ({ event, context }) => {
  const { roundId, startTime, endTime, initialPool } = event.params;

  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;
  const globalId = `lottery-stats-${event.chainId}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  await context.DailyLotteryRound.set({
    id: roundEntityId,
    roundId: roundId.toString(),
    startTime: startTime,
    endTime: endTime,
    prizePool: initialPool,
    ticketCount: 0,
    participantCount: 0,
    status: "Active",
    winner: undefined,
    winnerFid: undefined,
    wmonPrize: undefined,
    toursBonus: undefined,
    triggeredBy: undefined,
    triggerReward: undefined,
    drawSequenceNumber: undefined,
    createdAt: timestamp,
    completedAt: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update global stats
  let globalStats = await context.DailyLotteryGlobalStats.get(globalId);
  if (globalStats) {
    await context.DailyLotteryGlobalStats.set({
      ...globalStats,
      totalRounds: globalStats.totalRounds + 1,
      currentRoundId: roundId.toString(),
      lastUpdated: timestamp,
    });
  } else {
    await context.DailyLotteryGlobalStats.set({
      id: globalId,
      totalRounds: 1,
      totalTicketsSold: 0,
      totalWMONCollected: BigInt(0),
      totalWMONPaidOut: BigInt(0),
      totalTOURSPaidOut: BigInt(0),
      totalUniqueParticipants: 0,
      currentRoundId: roundId.toString(),
      lastUpdated: timestamp,
    });
  }

  const poolFormatted = (Number(initialPool) / 1e18).toFixed(2);
  context.log.info(`🎰 Lottery Round #${roundId} started - Initial pool: ${poolFormatted} WMON`);
});

DailyLottery.RoundRolledOver.handler(async ({ event, context }) => {
  const { roundId, poolAmount, ticketCount } = event.params;

  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  const existing = await context.DailyLotteryRound.get(roundEntityId);
  if (existing) {
    await context.DailyLotteryRound.set({
      ...existing,
      status: "RolledOver",
      completedAt: timestamp,
    });
  }

  const poolFormatted = (Number(poolAmount) / 1e18).toFixed(2);
  context.log.info(`🔄 Lottery Round #${roundId} rolled over - Pool: ${poolFormatted} WMON, Tickets: ${ticketCount}`);
});

DailyLottery.TicketPurchased.handler(async ({ event, context }) => {
  const { roundId, beneficiary, userFid, ticketCount, totalCost } = event.params;

  const ticketId = `ticket-${event.chainId}-${roundId.toString()}-${event.transaction.hash}-${event.logIndex}`;
  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;
  const userId = `user-${event.chainId}-${beneficiary.toLowerCase()}`;
  const globalId = `lottery-stats-${event.chainId}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create ticket record
  await context.DailyLotteryTicket.set({
    id: ticketId,
    round_id: roundEntityId,
    roundId: roundId.toString(),
    buyer: event.transaction.from?.toLowerCase() || beneficiary.toLowerCase(),
    beneficiary: beneficiary.toLowerCase(),
    userFid: userFid,
    ticketCount: Number(ticketCount),
    totalCost: totalCost,
    purchasedAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update round stats
  const round = await context.DailyLotteryRound.get(roundEntityId);
  if (round) {
    await context.DailyLotteryRound.set({
      ...round,
      ticketCount: round.ticketCount + Number(ticketCount),
      prizePool: round.prizePool + totalCost,
    });
  }

  // Update user stats
  let userStats = await context.DailyLotteryUserStats.get(userId);
  if (userStats) {
    await context.DailyLotteryUserStats.set({
      ...userStats,
      totalTicketsPurchased: userStats.totalTicketsPurchased + Number(ticketCount),
      totalSpentWMON: userStats.totalSpentWMON + totalCost,
      lastEntryAt: timestamp,
    });
  } else {
    await context.DailyLotteryUserStats.set({
      id: userId,
      user: beneficiary.toLowerCase(),
      totalTicketsPurchased: Number(ticketCount),
      totalSpentWMON: totalCost,
      totalWins: 0,
      totalWonWMON: BigInt(0),
      totalWonTOURS: BigInt(0),
      totalTriggersExecuted: 0,
      totalTriggerRewardsTOURS: BigInt(0),
      lastEntryAt: timestamp,
      lastWinAt: undefined,
    });

    // Update unique participants in global stats
    let globalStats = await context.DailyLotteryGlobalStats.get(globalId);
    if (globalStats) {
      await context.DailyLotteryGlobalStats.set({
        ...globalStats,
        totalUniqueParticipants: globalStats.totalUniqueParticipants + 1,
        totalTicketsSold: globalStats.totalTicketsSold + Number(ticketCount),
        totalWMONCollected: globalStats.totalWMONCollected + totalCost,
        lastUpdated: timestamp,
      });
    }
  }

  // Update global ticket count (for existing users)
  let globalStats = await context.DailyLotteryGlobalStats.get(globalId);
  if (globalStats && userStats) {
    await context.DailyLotteryGlobalStats.set({
      ...globalStats,
      totalTicketsSold: globalStats.totalTicketsSold + Number(ticketCount),
      totalWMONCollected: globalStats.totalWMONCollected + totalCost,
      lastUpdated: timestamp,
    });
  }

  const costFormatted = (Number(totalCost) / 1e18).toFixed(2);
  context.log.info(`🎟️ Lottery tickets purchased: ${beneficiary.slice(0, 8)}... bought ${ticketCount} tickets for ${costFormatted} WMON (Round #${roundId})`);
});

DailyLottery.DrawRequested.handler(async ({ event, context }) => {
  const { roundId, sequenceNumber, triggeredBy } = event.params;

  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;

  const round = await context.DailyLotteryRound.get(roundEntityId);
  if (round) {
    await context.DailyLotteryRound.set({
      ...round,
      status: "DrawPending",
      triggeredBy: triggeredBy.toLowerCase(),
      drawSequenceNumber: BigInt(sequenceNumber),
    });
  }

  context.log.info(`🎲 Lottery draw requested: Round #${roundId} by ${triggeredBy.slice(0, 8)}... (Pyth seq: ${sequenceNumber})`);
});

DailyLottery.DrawTriggered.handler(async ({ event, context }) => {
  const { roundId, triggeredBy, toursReward } = event.params;

  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;
  const userId = `user-${event.chainId}-${triggeredBy.toLowerCase()}`;
  const globalId = `lottery-stats-${event.chainId}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Update round with trigger info
  const round = await context.DailyLotteryRound.get(roundEntityId);
  if (round) {
    await context.DailyLotteryRound.set({
      ...round,
      triggeredBy: triggeredBy.toLowerCase(),
      triggerReward: toursReward,
    });
  }

  // Update trigger user stats
  let userStats = await context.DailyLotteryUserStats.get(userId);
  if (userStats) {
    await context.DailyLotteryUserStats.set({
      ...userStats,
      totalTriggersExecuted: userStats.totalTriggersExecuted + 1,
      totalTriggerRewardsTOURS: userStats.totalTriggerRewardsTOURS + toursReward,
    });
  } else {
    await context.DailyLotteryUserStats.set({
      id: userId,
      user: triggeredBy.toLowerCase(),
      totalTicketsPurchased: 0,
      totalSpentWMON: BigInt(0),
      totalWins: 0,
      totalWonWMON: BigInt(0),
      totalWonTOURS: BigInt(0),
      totalTriggersExecuted: 1,
      totalTriggerRewardsTOURS: toursReward,
      lastEntryAt: undefined,
      lastWinAt: undefined,
    });
  }

  // Update global TOURS paidout
  let globalStats = await context.DailyLotteryGlobalStats.get(globalId);
  if (globalStats) {
    await context.DailyLotteryGlobalStats.set({
      ...globalStats,
      totalTOURSPaidOut: globalStats.totalTOURSPaidOut + toursReward,
      lastUpdated: timestamp,
    });
  }

  const rewardFormatted = (Number(toursReward) / 1e18).toFixed(2);
  context.log.info(`⚡ Lottery draw triggered: ${triggeredBy.slice(0, 8)}... earned ${rewardFormatted} TOURS for Round #${roundId}`);
});

DailyLottery.WinnerSelected.handler(async ({ event, context }) => {
  const { roundId, winner, winnerFid, wmonPrize, toursBonus, totalEntries } = event.params;

  const roundEntityId = `round-${event.chainId}-${roundId.toString()}`;
  const winnerId = `winner-${event.chainId}-${roundId.toString()}`;
  const userId = `user-${event.chainId}-${winner.toLowerCase()}`;
  const globalId = `lottery-stats-${event.chainId}`;
  const timestamp = new Date(event.block.timestamp * 1000);

  // Update round as completed
  const round = await context.DailyLotteryRound.get(roundEntityId);
  if (round) {
    await context.DailyLotteryRound.set({
      ...round,
      status: "Completed",
      winner: winner.toLowerCase(),
      winnerFid: winnerFid,
      wmonPrize: wmonPrize,
      toursBonus: toursBonus,
      completedAt: timestamp,
    });
  }

  // Create winner record
  await context.DailyLotteryWinner.set({
    id: winnerId,
    roundId: roundId.toString(),
    winner: winner.toLowerCase(),
    winnerFid: winnerFid,
    wmonPrize: wmonPrize,
    toursBonus: toursBonus,
    totalEntries: Number(totalEntries),
    wonAt: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update winner user stats
  let userStats = await context.DailyLotteryUserStats.get(userId);
  if (userStats) {
    await context.DailyLotteryUserStats.set({
      ...userStats,
      totalWins: userStats.totalWins + 1,
      totalWonWMON: userStats.totalWonWMON + wmonPrize,
      totalWonTOURS: userStats.totalWonTOURS + toursBonus,
      lastWinAt: timestamp,
    });
  } else {
    await context.DailyLotteryUserStats.set({
      id: userId,
      user: winner.toLowerCase(),
      totalTicketsPurchased: 0,
      totalSpentWMON: BigInt(0),
      totalWins: 1,
      totalWonWMON: wmonPrize,
      totalWonTOURS: toursBonus,
      totalTriggersExecuted: 0,
      totalTriggerRewardsTOURS: BigInt(0),
      lastEntryAt: undefined,
      lastWinAt: timestamp,
    });
  }

  // Update global stats
  let globalStats = await context.DailyLotteryGlobalStats.get(globalId);
  if (globalStats) {
    await context.DailyLotteryGlobalStats.set({
      ...globalStats,
      totalWMONPaidOut: globalStats.totalWMONPaidOut + wmonPrize,
      totalTOURSPaidOut: globalStats.totalTOURSPaidOut + toursBonus,
      lastUpdated: timestamp,
    });
  }

  const wmonFormatted = (Number(wmonPrize) / 1e18).toFixed(2);
  const toursFormatted = (Number(toursBonus) / 1e18).toFixed(2);
  context.log.info(`🏆 Lottery winner selected! Round #${roundId}: ${winner.slice(0, 8)}... won ${wmonFormatted} WMON + ${toursFormatted} TOURS bonus (${totalEntries} entries)`);
});
