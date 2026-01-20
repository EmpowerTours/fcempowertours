import { redis } from './redis';

/**
 * Sponsorship System Types and Utilities
 *
 * Two-way sponsorship marketplace:
 * - Sponsors create offers → Hosts claim with code
 * - Hosts request sponsorships → Sponsors fund
 *
 * Escrow via Platform Safe, voting via API
 */

export type SponsorshipStatus =
  | 'awaiting_host'      // Sponsor created, waiting for host to claim
  | 'awaiting_sponsor'   // Host created, waiting for sponsor to fund
  | 'active'             // Both parties matched, event upcoming
  | 'checking_in'        // Event happening, guests checking in
  | 'voting'             // 1 hour voting window
  | 'completed'          // Funds released to host
  | 'refunded'           // Funds returned to sponsor
  | 'cancelled'
  | 'disputed';          // Escalated to DAO

export interface Sponsorship {
  id: string;

  // Sponsor info
  sponsorAddress: string | null;
  sponsorFid: number | null;
  sponsorName: string;

  // Host info
  hostAddress: string | null;
  hostFid: number | null;
  hostName: string;

  // Funds
  amount: string;           // In WMON (wei string)
  amountDisplay: string;    // Human readable (e.g., "5000")
  platformFee: string;      // Fee taken (wei string)
  depositTxHash: string | null;

  // Event details
  eventName: string;
  description: string;
  venueName: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  eventDate: number | null;        // Unix timestamp, null = TBD
  expectedGuests: number;

  // EventOracleLite integration
  eventOracleId: string | null;    // ID on EventOracleLite contract
  stampImageIPFS: string | null;

  // Claim code (for sponsor-created offers)
  claimCode: string | null;

  // Timing
  checkInStart: number | null;
  checkInEnd: number | null;
  votingDeadline: number | null;
  createdAt: number;
  claimedAt: number | null;

  // Status
  status: SponsorshipStatus;

  // Check-in tracking
  checkedInCount: number;
  checkedInGuests: string[];       // List of wallet addresses

  // Voting
  yesVotes: number;
  noVotes: number;
  voters: string[];                // Addresses that voted

  // Resolution
  resolvedAt: number | null;
  releaseTxHash: string | null;
}

export interface SponsorshipVote {
  sponsorshipId: string;
  voterAddress: string;
  voterFid: number;
  votedYes: boolean;
  votedAt: number;
  gpsVerified: boolean;
}

// Redis keys
const SPONSORSHIPS_KEY = 'sponsorship:all';
const SPONSORSHIP_PREFIX = 'sponsorship:';
const CLAIM_CODES_KEY = 'sponsorship:codes';
const VOTES_PREFIX = 'sponsorship:votes:';
const SPONSOR_HISTORY_PREFIX = 'sponsorship:sponsor:';
const HOST_HISTORY_PREFIX = 'sponsorship:host:';

// Generate claim code
export function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate sponsorship ID
export function generateSponsorshipId(): string {
  return `sp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// Save sponsorship
export async function saveSponsorship(sponsorship: Sponsorship): Promise<void> {
  await redis.hset(SPONSORSHIPS_KEY, {
    [sponsorship.id]: JSON.stringify(sponsorship)
  });

  // Index by claim code if exists
  if (sponsorship.claimCode) {
    await redis.hset(CLAIM_CODES_KEY, {
      [sponsorship.claimCode]: sponsorship.id
    });
  }

  // Index by sponsor
  if (sponsorship.sponsorAddress) {
    const key = `${SPONSOR_HISTORY_PREFIX}${sponsorship.sponsorAddress}`;
    const existing = await redis.get(key) as string[] | null;
    const ids = existing || [];
    if (!ids.includes(sponsorship.id)) {
      ids.push(sponsorship.id);
      await redis.set(key, ids);
    }
  }

  // Index by host
  if (sponsorship.hostAddress) {
    const key = `${HOST_HISTORY_PREFIX}${sponsorship.hostAddress}`;
    const existing = await redis.get(key) as string[] | null;
    const ids = existing || [];
    if (!ids.includes(sponsorship.id)) {
      ids.push(sponsorship.id);
      await redis.set(key, ids);
    }
  }
}

// Get sponsorship by ID
export async function getSponsorship(id: string): Promise<Sponsorship | null> {
  const data = await redis.hget(SPONSORSHIPS_KEY, id) as string | null;
  if (!data) return null;
  return JSON.parse(data);
}

// Get sponsorship by claim code
export async function getSponsorshipByCode(code: string): Promise<Sponsorship | null> {
  const id = await redis.hget(CLAIM_CODES_KEY, code.toUpperCase()) as string | null;
  if (!id) return null;
  return getSponsorship(id);
}

// Get all sponsorships
export async function getAllSponsorships(): Promise<Sponsorship[]> {
  const all = await redis.hgetall(SPONSORSHIPS_KEY) as Record<string, string> | null;
  if (!all) return [];
  return Object.values(all).map(s => JSON.parse(s));
}

// Get sponsorships by status
export async function getSponsorshipsByStatus(status: SponsorshipStatus): Promise<Sponsorship[]> {
  const all = await getAllSponsorships();
  return all.filter(s => s.status === status);
}

// Get sponsor's history
export async function getSponsorHistory(address: string): Promise<Sponsorship[]> {
  const ids = await redis.get(`${SPONSOR_HISTORY_PREFIX}${address}`) as string[] | null;
  if (!ids || ids.length === 0) return [];

  const sponsorships: Sponsorship[] = [];
  for (const id of ids) {
    const s = await getSponsorship(id);
    if (s) sponsorships.push(s);
  }
  return sponsorships;
}

// Get host's history
export async function getHostHistory(address: string): Promise<Sponsorship[]> {
  const ids = await redis.get(`${HOST_HISTORY_PREFIX}${address}`) as string[] | null;
  if (!ids || ids.length === 0) return [];

  const sponsorships: Sponsorship[] = [];
  for (const id of ids) {
    const s = await getSponsorship(id);
    if (s) sponsorships.push(s);
  }
  return sponsorships;
}

// Save vote
export async function saveVote(vote: SponsorshipVote): Promise<void> {
  const key = `${VOTES_PREFIX}${vote.sponsorshipId}`;
  await redis.hset(key, {
    [vote.voterAddress]: JSON.stringify(vote)
  });
}

// Get votes for sponsorship
export async function getVotes(sponsorshipId: string): Promise<SponsorshipVote[]> {
  const key = `${VOTES_PREFIX}${sponsorshipId}`;
  const all = await redis.hgetall(key) as Record<string, string> | null;
  if (!all) return [];
  return Object.values(all).map(v => JSON.parse(v));
}

// Check if user voted
export async function hasVoted(sponsorshipId: string, voterAddress: string): Promise<boolean> {
  const key = `${VOTES_PREFIX}${sponsorshipId}`;
  const vote = await redis.hget(key, voterAddress);
  return vote !== null;
}

// Calculate voting window
export function calculateVotingWindow(checkInEnd: number): { start: number; end: number } {
  return {
    start: checkInEnd,
    end: checkInEnd + (60 * 60 * 1000) // 1 hour
  };
}

// Check if voting is open
export function isVotingOpen(sponsorship: Sponsorship): boolean {
  if (!sponsorship.votingDeadline) return false;
  const now = Date.now();
  return now > (sponsorship.checkInEnd || 0) && now <= sponsorship.votingDeadline;
}

// Check if can finalize
export function canFinalize(sponsorship: Sponsorship): boolean {
  if (!sponsorship.votingDeadline) return false;
  const now = Date.now();
  return now > sponsorship.votingDeadline &&
         (sponsorship.status === 'voting' || sponsorship.status === 'checking_in' || sponsorship.status === 'active');
}

// Calculate release decision
export function shouldReleaseFunds(sponsorship: Sponsorship): { release: boolean; reason: string } {
  const minCheckins = Math.max(1, Math.floor(sponsorship.expectedGuests * 0.25)); // 25% minimum
  const totalVotes = sponsorship.yesVotes + sponsorship.noVotes;

  // Not enough check-ins
  if (sponsorship.checkedInCount < minCheckins) {
    return {
      release: false,
      reason: `Insufficient check-ins: ${sponsorship.checkedInCount}/${minCheckins} required`
    };
  }

  // No votes cast
  if (totalVotes === 0) {
    return {
      release: false,
      reason: 'No votes cast by attendees'
    };
  }

  // Majority voted NO
  if (sponsorship.noVotes >= sponsorship.yesVotes) {
    return {
      release: false,
      reason: `Majority voted NO: ${sponsorship.noVotes} no vs ${sponsorship.yesVotes} yes`
    };
  }

  // All conditions met
  return {
    release: true,
    reason: `Approved: ${sponsorship.yesVotes} yes vs ${sponsorship.noVotes} no, ${sponsorship.checkedInCount} check-ins`
  };
}

// Format amount for display
export function formatAmount(weiString: string): string {
  try {
    const wei = BigInt(weiString);
    const ether = Number(wei) / 1e18;
    return ether.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } catch {
    return weiString;
  }
}

// Parse amount from display
export function parseAmount(display: string): string {
  try {
    const num = parseFloat(display.replace(/,/g, ''));
    return (BigInt(Math.floor(num * 1e18))).toString();
  } catch {
    return '0';
  }
}
