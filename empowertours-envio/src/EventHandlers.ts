import {
  EmpowerToursNFT,
  PassportNFT,
  ItineraryNFT,
  PlayOracle,
  MusicSubscriptionV2,
  LiveRadio,
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

PassportNFT.PassportMinted.handler(async ({ event, context }) => {
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

// ✅ Verification flow handlers
PassportNFT.VerificationRequested.handler(async ({ event, context }) => {
  const { tokenId, owner, photoProofIPFS } = event.params;

  context.log.info(`📸 Verification requested for Passport #${tokenId} by ${owner} - proof: ${photoProofIPFS}`);
});

PassportNFT.VerificationApproved.handler(async ({ event, context }) => {
  const { tokenId, oracle } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const passportNFT = await context.PassportNFT.get(passportNFTId);

  if (passportNFT) {
    await context.PassportNFT.set({
      ...passportNFT,
      verified: true,
    });
  }

  context.log.info(`✅ Passport #${tokenId} verification APPROVED by oracle ${oracle}`);
});

PassportNFT.VerificationRejected.handler(async ({ event, context }) => {
  const { tokenId, oracle, reason } = event.params;

  context.log.info(`❌ Passport #${tokenId} verification REJECTED by oracle ${oracle} - reason: ${reason}`);
});

// ✅ Venue stamp handler (venueName, creditAdded)
PassportNFT.VenueStampAdded.handler(async ({ event, context }) => {
  const { tokenId, venueName, creditAdded } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
  const venueStampId = `venue-stamp-${event.block.number}-${event.logIndex}`;

  // Create venue stamp
  const venueStamp = {
    id: venueStampId,
    passport_id: passportNFTId,
    tokenId: tokenId.toString(),
    location: venueName, // Use venueName as location
    eventType: "", // Not provided in this event
    artist: undefined,
    timestamp: BigInt(event.block.timestamp),
    verified: false, // Default to false, can be updated later
    addedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.VenueStamp.set(venueStamp);

  // Update passport stamp count and credit score using creditAdded from event
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const newStampCount = passportNFT.stampCount + 1;
    const newCreditScore = passportNFT.creditScore + Number(creditAdded);

    await context.PassportNFT.set({
      ...passportNFT,
      stampCount: newStampCount,
      creditScore: newCreditScore,
    });

    context.log.info(`🎟️ Venue stamp added to Passport #${tokenId}: "${venueName}" (+${creditAdded} credit). New score: ${newCreditScore}`);
  }
});

// ✅ Itinerary stamp handler
PassportNFT.ItineraryStampAdded.handler(async ({ event, context }) => {
  const { tokenId, itineraryId, creditAdded } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

  // Update passport credit score
  const passportNFT = await context.PassportNFT.get(passportNFTId);
  if (passportNFT) {
    const newCreditScore = passportNFT.creditScore + Number(creditAdded);

    await context.PassportNFT.set({
      ...passportNFT,
      creditScore: newCreditScore,
    });

    context.log.info(`🗺️ Itinerary stamp added to Passport #${tokenId} for itinerary #${itineraryId} (+${creditAdded} credit). New score: ${newCreditScore}`);
  }
});

// ============================================
// ITINERARY NFT EVENTS
// ============================================

ItineraryNFT.ItineraryCreated.handler(async ({ event, context }) => {
  const { itineraryId, creator, creatorFid, title, city, country, price } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;
  const userId = creator.toLowerCase();
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create itinerary entity (using existing schema fields)
  const itinerary = {
    id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    creator: userId,
    description: `${title} - ${city}, ${country}`, // Store title/city/country in description
    price: price,
    active: true,
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

  context.log.info(`🗺️ Itinerary #${itineraryId} created by ${creator} (FID: ${creatorFid}) - "${title}" in ${city}, ${country}`);
});

ItineraryNFT.ItineraryPurchased.handler(async ({ event, context }) => {
  const { itineraryId, buyer, buyerFid, price } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;
  const purchaseId = `purchase-${event.chainId}-${event.transaction.hash}-${event.logIndex}`;
  const userId = buyer.toLowerCase();
  const timestamp = new Date(event.block.timestamp * 1000);

  // Create purchase record (using existing schema fields)
  await context.ItineraryPurchase.set({
    id: purchaseId,
    itinerary_id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    buyer: userId,
    timestamp: timestamp,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  });

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

  context.log.info(`🎫 Itinerary #${itineraryId} purchased by ${buyer} (FID: ${buyerFid}) for ${price}`);
});

ItineraryNFT.LocationCompleted.handler(async ({ event, context }) => {
  const { itineraryId, user, locationIndex, photoProofIPFS } = event.params;

  // Just log - no entity for this in current schema
  context.log.info(`📍 Location ${locationIndex} completed for Itinerary #${itineraryId} by ${user.slice(0, 8)}... - proof: ${photoProofIPFS}`);
});

ItineraryNFT.ItineraryRated.handler(async ({ event, context }) => {
  const { itineraryId, user, rating, reviewIPFS } = event.params;

  // Just log - no entity for this in current schema
  context.log.info(`⭐ Itinerary #${itineraryId} rated ${rating}/5 by ${user.slice(0, 8)}... - review: ${reviewIPFS}`);
});

ItineraryNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  // Skip mint events
  if (from === "0x0000000000000000000000000000000000000000") {
    return;
  }

  context.log.info(`🗺️ Itinerary NFT #${tokenId} transferred from ${from} to ${to}`);
});

// =============================================================================
// ✅ PlayOracle Event Handlers (Music Streaming Stats)
// =============================================================================

PlayOracle.PlayRecorded.handler(async ({ event, context }) => {
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

PlayOracle.OperatorAdded.handler(async ({ event, context }) => {
  const { operator } = event.params;
  context.log.info(`➕ PlayOracle operator added: ${operator}`);
});

PlayOracle.OperatorRemoved.handler(async ({ event, context }) => {
  const { operator } = event.params;
  context.log.info(`➖ PlayOracle operator removed: ${operator}`);
});

// =============================================================================
// ✅ MusicSubscriptionV2 Event Handlers (Artist Payouts & More Play Records)
// =============================================================================

MusicSubscriptionV2.Subscribed.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.SubscriptionRenewed.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.PlayRecorded.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.MonthlyDistributionFinalized.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.ArtistPayout.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.ArtistToursReward.handler(async ({ event, context }) => {
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

MusicSubscriptionV2.ReserveAdded.handler(async ({ event, context }) => {
  const { monthId, amount, totalReserve } = event.params;

  context.log.info(`💰 Reserve added for month ${monthId}: ${amount} (total: ${totalReserve})`);
});

MusicSubscriptionV2.ReserveWithdrawnToDAO.handler(async ({ event, context }) => {
  const { dao, amount } = event.params;

  context.log.info(`💸 Reserve withdrawn to DAO ${dao}: ${amount}`);
});

MusicSubscriptionV2.AccountFlagged.handler(async ({ event, context }) => {
  const { user, reason } = event.params;

  context.log.info(`🚩 Account flagged: ${user} - reason: ${reason}`);
});

MusicSubscriptionV2.AccountUnflagged.handler(async ({ event, context }) => {
  const { user } = event.params;

  context.log.info(`✅ Account unflagged: ${user}`);
});

MusicSubscriptionV2.VoteToFlag.handler(async ({ event, context }) => {
  const { voter, target, totalVotes } = event.params;

  context.log.info(`🗳️ Vote to flag: ${voter} voted to flag ${target} (total votes: ${totalVotes})`);
});

// ============================================
// LIVE RADIO EVENTS (World Cup 2026 Jukebox)
// ============================================

// Radio lifecycle events
LiveRadio.RadioStarted.handler(async ({ event, context }) => {
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

LiveRadio.RadioStopped.handler(async ({ event, context }) => {
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
LiveRadio.SongQueued.handler(async ({ event, context }) => {
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
LiveRadio.SongPlayed.handler(async ({ event, context }) => {
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
LiveRadio.VoiceNoteSubmitted.handler(async ({ event, context }) => {
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

LiveRadio.VoiceNotePlayed.handler(async ({ event, context }) => {
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
LiveRadio.ListenerRewarded.handler(async ({ event, context }) => {
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

LiveRadio.StreakBonusClaimed.handler(async ({ event, context }) => {
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

LiveRadio.FirstListenerBonus.handler(async ({ event, context }) => {
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
LiveRadio.TipReceived.handler(async ({ event, context }) => {
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

LiveRadio.RewardsClaimed.handler(async ({ event, context }) => {
  const { user, amount } = event.params;

  context.log.info(`💰 ${user.slice(0, 8)}... claimed ${amount} TOURS rewards`);
});

// Random song selection (Pyth Entropy)
LiveRadio.RandomSongRequested.handler(async ({ event, context }) => {
  const { sequenceNumber, requester } = event.params;

  context.log.info(`🎲 Random song requested - sequence: ${sequenceNumber}, requester: ${requester.slice(0, 8)}...`);
});

LiveRadio.RandomSongSelected.handler(async ({ event, context }) => {
  const { masterTokenId, randomValue } = event.params;

  context.log.info(`🎲 Random song selected: #${masterTokenId} (random: ${randomValue})`);
});

// Song pool management
LiveRadio.SongAddedToPool.handler(async ({ event, context }) => {
  const { masterTokenId } = event.params;

  context.log.info(`➕ Song #${masterTokenId} added to radio pool`);
});

LiveRadio.SongRemovedFromPool.handler(async ({ event, context }) => {
  const { masterTokenId } = event.params;

  context.log.info(`➖ Song #${masterTokenId} removed from radio pool`);
});
