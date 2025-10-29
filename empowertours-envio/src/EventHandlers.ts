import {
  MusicLicenseNFT,
  PassportNFT,
  Marketplace,
} from "generated";

// ✅ NEW: Type definition for metadata
interface MusicMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: any }>;
}

// ✅ NEW: Helper function to resolve IPFS URLs
const PINATA_GATEWAY = "harlequin-used-hare-224.mypinata.cloud";

function resolveIPFS(url: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", `https://${PINATA_GATEWAY}/ipfs/`);
  }
  return url;
}

// ✅ NEW: Fetch metadata from IPFS with proper return type
async function fetchMetadata(tokenURI: string, context: any): Promise<{
  name: string;
  description: string;
  imageUrl: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
} | null> {
  try {
    const metadataUrl = resolveIPFS(tokenURI);
    context.log.info(`📦 Fetching metadata from: ${metadataUrl}`);
    
    const response = await fetch(metadataUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!response.ok) {
      context.log.warn(`⚠️ Metadata fetch failed: HTTP ${response.status}`);
      return null;
    }
    
    const metadata = await response.json() as MusicMetadata;
    
    context.log.info(`✅ Metadata fetched successfully:`, {
      name: metadata.name,
      hasImage: !!metadata.image,
      hasAnimationUrl: !!metadata.animation_url,
      hasExternalUrl: !!metadata.external_url,
    });
    
    return {
      name: metadata.name || "",
      description: metadata.description || "",
      imageUrl: resolveIPFS(metadata.image || ""),
      previewAudioUrl: resolveIPFS(metadata.animation_url || ""),
      fullAudioUrl: resolveIPFS(metadata.external_url || ""),
    };
  } catch (error) {
    context.log.error(`❌ Failed to fetch metadata: ${error}`);
    return null;
  }
}

// ============================================
// MUSIC LICENSE NFT EVENTS
// ============================================

MusicLicenseNFT.MasterMinted.handler(async ({ event, context }) => {
  const { tokenId, artist, tokenURI, price } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;

  // ✅ NEW: Fetch metadata during indexing
  const metadata = await fetchMetadata(tokenURI, context);

  const musicNFT = {
    id: musicNFTId,
    tokenId: tokenId.toString(),
    contract: event.srcAddress.toLowerCase(),
    artist: artist.toLowerCase(),
    owner: artist.toLowerCase(),
    tokenURI: tokenURI,
    price: price,
    totalSold: 0,
    active: true,
    coverArt: "",
    royaltyPercentage: 10,
    
    // ✅ NEW: Store metadata fields
    name: metadata?.name || `Music NFT #${tokenId}`,
    description: metadata?.description || "",
    imageUrl: metadata?.imageUrl || "",
    previewAudioUrl: metadata?.previewAudioUrl || "",
    fullAudioUrl: metadata?.fullAudioUrl || "",
    metadataFetched: !!metadata,
    
    mintedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.MusicNFT.set(musicNFT);

  const userId = artist.toLowerCase();
  let userStats = await context.UserStats.get(userId);

  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      musicNFTCount: userStats.musicNFTCount + 1,
      totalNFTs: userStats.totalNFTs + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: artist.toLowerCase(),
      musicNFTCount: 1,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      totalNFTs: 1,
      licensesOwned: 0,
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
      totalMusicLicensesPurchased: 0,
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎵 Music NFT #${tokenId} minted by ${artist} - "${metadata?.name || 'Untitled'}" - URI: ${tokenURI}`);
});

// ✅ Handle LicensePurchased event with createdAt field
MusicLicenseNFT.LicensePurchased.handler(async ({ event, context }) => {
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
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 1,
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
      totalMusicLicensesPurchased: 1,
      totalUsers: 1,
      lastUpdated: timestamp,
    });
  }

  context.log.info(
    `💳 License #${licenseId} purchased for Music NFT #${masterTokenId} by ${buyer} - Expires: ${new Date(Number(expiry) * 1000).toISOString()}`
  );
});

// ✅ Handle LicenseExpired event
MusicLicenseNFT.LicenseExpired.handler(async ({ event, context }) => {
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

MusicLicenseNFT.Transfer.handler(async ({ event, context }) => {
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
// PASSPORT NFT EVENTS
// ============================================

PassportNFT.PassportMinted.handler(async ({ event, context }) => {
  const { tokenId, owner, countryCode, countryName, region, continent } = event.params;

  const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

  const passportNFT = {
    id: passportNFTId,
    tokenId: tokenId.toString(),
    contract: event.srcAddress.toLowerCase(),
    owner: owner.toLowerCase(),
    countryCode: countryCode,
    countryName: countryName,
    region: region,
    continent: continent,
    tokenURI: "",
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
      passportNFTCount: 1,
      itinerariesCreated: 0,
      itinerariesPurchased: 0,
      totalNFTs: 1,
      licensesOwned: 0,
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
      totalMusicLicensesPurchased: 0,
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(
    `🎫 Passport NFT #${tokenId} minted for ${owner} - ${countryCode} ${countryName} (${region}, ${continent})`
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

// ============================================
// MARKETPLACE/ITINERARY EVENTS
// ============================================

Marketplace.ItineraryCreated.handler(async ({ event, context }) => {
  const { itineraryId, creator, description, price } = event.params;

  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;

  const itinerary = {
    id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    creator: creator.toLowerCase(),
    description: description,
    price: price,
    active: true,
    createdAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.Itinerary.set(itinerary);

  const userId = creator.toLowerCase();
  let userStats = await context.UserStats.get(userId);

  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      itinerariesCreated: userStats.itinerariesCreated + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: creator.toLowerCase(),
      musicNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 1,
      itinerariesPurchased: 0,
      totalNFTs: 0,
      licensesOwned: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalItineraries: globalStats.totalItineraries + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 0,
      totalPassports: 0,
      totalItineraries: 1,
      totalItineraryPurchases: 0,
      totalMusicLicensesPurchased: 0,
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🗺️ Itinerary #${itineraryId} created by ${creator}: ${description} for ${price}`);
});

Marketplace.ItineraryPurchased.handler(async ({ event, context }) => {
  const { itineraryId, buyer } = event.params;

  const purchaseId = `purchase-${event.block.number}-${event.logIndex}`;
  const itineraryEntityId = `itinerary-${event.chainId}-${itineraryId.toString()}`;

  const purchase = {
    id: purchaseId,
    itinerary_id: itineraryEntityId,
    itineraryId: itineraryId.toString(),
    buyer: buyer.toLowerCase(),
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };

  await context.ItineraryPurchase.set(purchase);

  const userId = buyer.toLowerCase();
  let buyerStats = await context.UserStats.get(userId);

  const isNewUser = !buyerStats;

  if (buyerStats) {
    await context.UserStats.set({
      ...buyerStats,
      itinerariesPurchased: buyerStats.itinerariesPurchased + 1,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.UserStats.set({
      id: userId,
      address: buyer.toLowerCase(),
      musicNFTCount: 0,
      passportNFTCount: 0,
      itinerariesCreated: 0,
      itinerariesPurchased: 1,
      totalNFTs: 0,
      licensesOwned: 0,
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  let globalStats = await context.GlobalStats.get("global");

  if (globalStats) {
    await context.GlobalStats.set({
      ...globalStats,
      totalItineraryPurchases: globalStats.totalItineraryPurchases + 1,
      totalUsers: isNewUser ? globalStats.totalUsers + 1 : globalStats.totalUsers,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  } else {
    await context.GlobalStats.set({
      id: "global",
      totalMusicNFTs: 0,
      totalPassports: 0,
      totalItineraries: 0,
      totalItineraryPurchases: 1,
      totalMusicLicensesPurchased: 0,
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🛒 Itinerary #${itineraryId} purchased by ${buyer}`);
});
