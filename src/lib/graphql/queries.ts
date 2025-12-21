/**
 * GraphQL Queries for EmpowerTours Envio Indexer
 *
 * These queries fetch real-time indexed data from the Envio GraphQL endpoint.
 */

// Base GraphQL endpoint (update with your Envio deployment URL)
export const ENVIO_GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';

/**
 * Query user statistics
 */
export const GET_USER_STATS = `
  query GetUserStats($address: String!) {
    UserStats(where: { address: { _eq: $address } }) {
      id
      address
      musicNFTCount
      artNFTCount
      passportNFTCount
      itinerariesCreated
      itinerariesPurchased
      totalNFTs
      licensesOwned
      lastActive
    }
  }
`;

/**
 * Query all music NFTs
 */
export const GET_ALL_MUSIC_NFTS = `
  query GetAllMusicNFTs($limit: Int = 20, $offset: Int = 0) {
    MusicNFT(limit: $limit, offset: $offset, order_by: { mintedAt: desc }) {
      id
      tokenId
      name
      description
      artist
      owner
      price
      totalSold
      imageUrl
      previewAudioUrl
      fullAudioUrl
      mintedAt
    }
  }
`;

/**
 * Query music NFTs by artist
 */
export const GET_MUSIC_NFTS_BY_ARTIST = `
  query GetMusicNFTsByArtist($artist: String!) {
    MusicNFT(where: { artist: { _eq: $artist } }, order_by: { mintedAt: desc }) {
      id
      tokenId
      name
      description
      price
      totalSold
      imageUrl
      previewAudioUrl
      mintedAt
    }
  }
`;

/**
 * Query passport NFTs by owner
 */
export const GET_PASSPORTS_BY_OWNER = `
  query GetPassportsByOwner($owner: String!) {
    PassportNFT(where: { owner: { _eq: $owner } }) {
      id
      tokenId
      countryCode
      countryName
      region
      continent
      mintedAt
    }
  }
`;

/**
 * Query global stats
 */
export const GET_GLOBAL_STATS = `
  query GetGlobalStats {
    GlobalStats(where: { id: { _eq: "global" } }) {
      totalMusicNFTs
      totalPassports
      totalItineraries
      totalItineraryPurchases
      totalMusicLicensesPurchased
      totalUsers
      lastUpdated
    }
  }
`;

/**
 * Query staking activities (YieldStrategy events)
 */
export const GET_STAKING_ACTIVITIES = `
  query GetStakingActivities($user: String, $limit: Int = 10) {
    YieldStrategy_Staked(
      where: { user: { _eq: $user } }
      order_by: { block_timestamp: desc }
      limit: $limit
    ) {
      user
      amount
      block_timestamp
      txHash
    }
    YieldStrategy_Unstaked(
      where: { user: { _eq: $user } }
      order_by: { block_timestamp: desc }
      limit: $limit
    ) {
      user
      amount
      block_timestamp
      txHash
    }
    YieldStrategy_RewardsClaimed(
      where: { user: { _eq: $user } }
      order_by: { block_timestamp: desc }
      limit: $limit
    ) {
      user
      amount
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query demand signals for events
 */
export const GET_DEMAND_SIGNALS = `
  query GetDemandSignals($eventId: String) {
    DemandSignalEngine_DemandSubmitted(
      where: { eventId: { _eq: $eventId } }
      order_by: { block_timestamp: desc }
    ) {
      user
      eventId
      amount
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query events from SmartEventManifest
 */
export const GET_SMART_EVENTS = `
  query GetSmartEvents($limit: Int = 20) {
    SmartEventManifest_EventCreated(
      order_by: { block_timestamp: desc }
      limit: $limit
    ) {
      eventId
      name
      location
      startDate
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query ticket purchases
 */
export const GET_TICKET_PURCHASES = `
  query GetTicketPurchases($eventId: String, $buyer: String) {
    SmartEventManifest_TicketPurchased(
      where: {
        eventId: { _eq: $eventId }
        buyer: { _eq: $buyer }
      }
      order_by: { block_timestamp: desc }
    ) {
      eventId
      buyer
      quantity
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query Tanda groups
 */
export const GET_TANDA_GROUPS = `
  query GetTandaGroups($limit: Int = 20) {
    TandaYieldGroup_GroupCreated(
      order_by: { block_timestamp: desc }
      limit: $limit
    ) {
      groupId
      creator
      name
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query Tanda group activities
 */
export const GET_TANDA_GROUP_ACTIVITIES = `
  query GetTandaGroupActivities($groupId: String!) {
    TandaYieldGroup_MemberJoined(
      where: { groupId: { _eq: $groupId } }
      order_by: { block_timestamp: desc }
    ) {
      groupId
      member
      block_timestamp
      txHash
    }
    TandaYieldGroup_ContributionMade(
      where: { groupId: { _eq: $groupId } }
      order_by: { block_timestamp: desc }
    ) {
      groupId
      member
      amount
      block_timestamp
      txHash
    }
    TandaYieldGroup_PayoutClaimed(
      where: { groupId: { _eq: $groupId } }
      order_by: { block_timestamp: desc }
    ) {
      groupId
      member
      amount
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query credit score updates
 */
export const GET_CREDIT_SCORE_HISTORY = `
  query GetCreditScoreHistory($user: String!) {
    CreditScoreCalculator_ScoreUpdated(
      where: { user: { _eq: $user } }
      order_by: { block_timestamp: desc }
    ) {
      user
      oldScore
      newScore
      block_timestamp
      txHash
    }
  }
`;

/**
 * Query payment records
 */
export const GET_PAYMENT_RECORDS = `
  query GetPaymentRecords($user: String!) {
    CreditScoreCalculator_PaymentRecorded(
      where: { user: { _eq: $user } }
      order_by: { block_timestamp: desc }
    ) {
      user
      amount
      onTime
      block_timestamp
      txHash
    }
  }
`;

/**
 * Helper function to execute GraphQL queries
 */
export async function executeQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const response = await fetch(ENVIO_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  } catch (error) {
    console.error('GraphQL query failed:', error);
    throw error;
  }
}

/**
 * React hooks for GraphQL queries (optional - requires additional setup)
 */
export function useUserStats(address: string) {
  // Implementation would use SWR or React Query
  // This is a placeholder for the structure
  return {
    data: null,
    error: null,
    isLoading: false,
  };
}
