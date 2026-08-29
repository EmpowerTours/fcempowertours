export interface EPKMetadata {
  version: string;
  artist: ArtistInfo;
  musicCatalog: MusicCatalogConfig;
  media: MediaSection;
  press: PressArticle[];
  booking: BookingConfig;
  technicalRider: TechnicalRider;
  hospitalityRider: HospitalityRider;
  socials: SocialLinks;
  onChain: OnChainInfo;
}

export interface ArtistInfo {
  name: string;
  slug: string;
  bio: string;
  genre: string[];
  location: string;
  profileImage?: string; // IPFS CID or URL
  bannerImage?: string; // IPFS CID or URL
  farcasterFid?: number;
  walletAddress?: string;
}

export interface MusicCatalogConfig {
  // Music catalog is loaded from Envio at render time, not stored in EPK metadata
  showCatalog: boolean;
  featuredTokenIds?: number[];
}

export interface MediaSection {
  videos: MediaVideo[];
  photos: string[]; // IPFS CIDs or URLs
}

export interface MediaVideo {
  title: string;
  url: string;
  platform: "rumble" | "youtube" | "vimeo" | "other";
}

export interface PressArticle {
  outlet: string;
  title: string;
  url: string;
  date: string; // ISO date string
  excerpt: string;
}

export interface BookingConfig {
  pricing: string;
  inquiryEnabled: boolean;
  availableFor: string[];
  territories: string[];
  targetEvents: string[];
  minimumDeposit?: string; // WMON amount
}

export interface TechnicalRider {
  stage: RiderSection;
  sound: RiderSection;
  lighting: RiderSection;
  video: RiderSection;
  backline: RiderSection;
  soundcheck: RiderSection;
  crew: RiderSection;
}

export interface HospitalityRider {
  dressingRoom: RiderSection;
  catering: RiderSection;
  beverages: RiderSection;
  transport: RiderSection;
  hotel: RiderSection;
  security: RiderSection;
  guestList: RiderSection;
  payment: RiderSection;
}

export interface RiderSection {
  title: string;
  items: string[];
}

export interface SocialLinks {
  farcaster?: string;
  twitter?: string;
  instagram?: string;
  website?: string;
  spotify?: string;
  soundcloud?: string;
}

export interface OnChainInfo {
  contractAddress?: string;
  txHash?: string;
  ipfsCid?: string;
  registeredAt?: number;
  updatedAt?: number;
}

// Envio query types for streaming stats
export interface ArtistStreamingStats {
  totalPlays: number;
  /**
   * `null` when unknown, which is the normal case since the indexer was removed: no contract
   * keeps a roster of listeners. `PlayOracleV3` stores `lastPlayTime[user][song]` — a timestamp,
   * not a set — and `MusicSubscriptionV6` keys plays by user and day with nothing enumerable.
   * Zero would claim nobody has ever listened, which is a different and false statement.
   */
  uniqueListeners: number | null;
  totalSales: number;
  totalRevenue: string; // formatted WMON
  topSongs: SongStats[];
}

export interface SongStats {
  tokenId: number;
  title: string;
  artist: string;
  coverImage: string;
  audioUrl: string;
  plays: number;
  sales: number;
}

// Booking inquiry (stored in Redis, private data)
export interface BookingInquiry {
  id: string;
  artistAddress: string;
  name: string;
  email: string;
  company?: string;
  eventName: string;
  eventDate: string;
  location: string;
  eventType: string;
  expectedAttendance: string;
  message: string;
  depositAmount?: string;
  bookingId?: number; // on-chain booking ID
  txHash?: string;
  status: "inquiry" | "deposited" | "confirmed" | "completed" | "cancelled";
  createdAt: number;
}
