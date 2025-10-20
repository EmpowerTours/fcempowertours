import {
  MusicLicenseNFT,
  PassportNFT,
  Marketplace,
} from "generated";

// ============================================
// MUSIC LICENSE NFT EVENTS
// ============================================

// ✅ FIXED: Changed from MusicMinted to MasterMinted
MusicLicenseNFT.MasterMinted.handler(async ({ event, context }) => {
  const { tokenId, artist, tokenURI, price } = event.params;

  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;

  const musicNFT = {
    id: musicNFTId,
    tokenId: tokenId.toString(),
    contract: event.srcAddress.toLowerCase(),
    artist: artist.toLowerCase(),
    owner: artist.toLowerCase(),
    tokenURI: tokenURI,  // ✅ Now correctly captures tokenURI
    coverArt: "",
    royaltyPercentage: 10, // Default 10%
    mintedAt: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,  // ✅ Now populated!
  };

  await context.MusicNFT.set(musicNFT);

  // Update user stats
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
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
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
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🎵 Music NFT #${tokenId} minted by ${artist} - URI: ${tokenURI}`);
});

// License Purchase Event
MusicLicenseNFT.LicensePurchased.handler(async ({ event, context }) => {
  const { tokenId, buyer, price } = event.params;

  const purchaseId = `license-${event.block.number}-${event.logIndex}`;
  const musicNFTId = `music-${event.chainId}-${tokenId.toString()}`;

  const licensePurchase = {
    id: purchaseId,
    music_id: musicNFTId,
    tokenId: tokenId.toString(),
    buyer: buyer.toLowerCase(),
    price: price,
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,  // ✅ Now populated!
  };

  await context.LicensePurchase.set(licensePurchase);

  context.log.info(`💳 License purchased for Music NFT #${tokenId} by ${buyer} for ${price}`);
});

// Royalty Payment Event
MusicLicenseNFT.RoyaltyPaid.handler(async ({ event, context }) => {
  const { tokenId, recipient, amount } = event.params;

  const paymentId = `royalty-${event.block.number}-${event.logIndex}`;

  const royaltyPayment = {
    id: paymentId,
    tokenId: tokenId.toString(),
    recipient: recipient.toLowerCase(),
    amount: amount,
    timestamp: new Date(event.block.timestamp * 1000),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,  // ✅ Now populated!
  };

  await context.RoyaltyPayment.set(royaltyPayment);

  context.log.info(`💰 Royalty paid for Music NFT #${tokenId} to ${recipient}: ${amount}`);
});

// Music NFT Transfer Event
MusicLicenseNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  // Skip mints (already handled by MasterMinted)
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

PassportNFT.Transfer.handler(async ({ event, context }) => {
  const { from, to, tokenId } = event.params;

  // Handle mints
  if (from === "0x0000000000000000000000000000000000000000") {
    const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;

    const passportNFT = {
      id: passportNFTId,
      tokenId: tokenId.toString(),
      contract: event.srcAddress.toLowerCase(),
      owner: to.toLowerCase(),
      countryCode: "",
      tokenURI: "",
      mintedAt: new Date(event.block.timestamp * 1000),
      blockNumber: BigInt(event.block.number),
      txHash: event.transaction.hash,  // ✅ Now populated!
    };

    await context.PassportNFT.set(passportNFT);

    // Update user stats
    const userId = to.toLowerCase();
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
        address: to.toLowerCase(),
        musicNFTCount: 0,
        passportNFTCount: 1,
        itinerariesCreated: 0,
        itinerariesPurchased: 0,
        totalNFTs: 1,
        lastActive: new Date(event.block.timestamp * 1000),
      });
    }

    // Update global stats
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
        totalUsers: 1,
        lastUpdated: new Date(event.block.timestamp * 1000),
      });
    }

    context.log.info(`🎫 Passport NFT #${tokenId} minted for ${to}`);
  } else {
    // Handle transfers
    const passportNFTId = `passport-${event.chainId}-${tokenId.toString()}`;
    const passportNFT = await context.PassportNFT.get(passportNFTId);

    if (passportNFT) {
      await context.PassportNFT.set({
        ...passportNFT,
        owner: to.toLowerCase(),
      });
      context.log.info(`🎫 Passport NFT #${tokenId} transferred from ${from} to ${to}`);
    }
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
  };

  await context.Itinerary.set(itinerary);

  // Update creator's user stats
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
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
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
    txHash: event.transaction.hash,  // ✅ Now populated!
  };

  await context.ItineraryPurchase.set(purchase);

  // Update buyer's user stats
  const userId = buyer.toLowerCase();
  let userStats = await context.UserStats.get(userId);

  const isNewUser = !userStats;

  if (userStats) {
    await context.UserStats.set({
      ...userStats,
      itinerariesPurchased: userStats.itinerariesPurchased + 1,
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
      lastActive: new Date(event.block.timestamp * 1000),
    });
  }

  // Update global stats
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
      totalUsers: 1,
      lastUpdated: new Date(event.block.timestamp * 1000),
    });
  }

  context.log.info(`🛒 Itinerary #${itineraryId} purchased by ${buyer}`);
});
