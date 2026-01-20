import { createPublicClient, createWalletClient, http, parseAbi, Address, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';

/**
 * EventSponsorship Contract Integration
 *
 * Two-way sponsorship marketplace with on-chain escrow and voting.
 */

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const EVENT_SPONSORSHIP_ADDRESS = process.env.NEXT_PUBLIC_EVENT_SPONSORSHIP as Address;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

// Re-export activeChain for backwards compatibility
export { activeChain as monadTestnet };

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

export function getOracleWalletClient() {
  if (!DEPLOYER_KEY) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  const account = privateKeyToAccount(DEPLOYER_KEY);
  return createWalletClient({
    account,
    chain: activeChain,
    transport: http(MONAD_RPC),
  });
}

// EventSponsorship ABI
export const eventSponsorshipAbi = parseAbi([
  // Read functions
  'function getSponsorship(uint256 id) external view returns ((address sponsor, address host, uint256 amount, string eventName, string city, string country, int256 latitude, int256 longitude, uint256 eventDate, uint256 expectedGuests, bytes32 claimCodeHash, uint256 checkInStart, uint256 checkInEnd, uint256 votingDeadline, uint256 createdAt, uint8 status, uint256 checkedInCount, uint256 yesVotes, uint256 noVotes))',
  'function getTotalSponsorships() external view returns (uint256)',
  'function getVoteTally(uint256 id) external view returns (uint256 yes, uint256 no)',
  'function canFinalize(uint256 id) external view returns (bool)',
  'function isCheckedIn(uint256 id, address user) external view returns (bool)',
  'function hasVoted(uint256 id, address user) external view returns (bool)',
  'function hasCheckedIn(uint256 id, address user) external view returns (bool)',
  'function PLATFORM_FEE_BPS() external view returns (uint256)',
  'function VOTING_WINDOW() external view returns (uint256)',
  'function MIN_CHECKIN_BPS() external view returns (uint256)',

  // Write functions
  'function createSponsorshipOffer(uint256 amount, string eventName, string city, string country, uint256 expectedGuests, string claimCode) external returns (uint256)',
  'function claimAsHost(uint256 id, string claimCode) external',
  'function createSponsorshipRequest(uint256 requestedAmount, string eventName, string city, string country, int256 latitude, int256 longitude, uint256 eventDate, uint256 expectedGuests) external returns (uint256)',
  'function fundSponsorship(uint256 id, uint256 amount) external',
  'function setEventDetails(uint256 id, uint256 eventDate, int256 latitude, int256 longitude) external',
  'function checkIn(uint256 id) external',
  'function checkInFor(uint256 id, address guest) external',
  'function vote(uint256 id, bool yes) external',
  'function finalize(uint256 id) external',
  'function cancel(uint256 id) external',

  // Events
  'event SponsorshipCreated(uint256 indexed id, address indexed creator, uint8 status, uint256 amount, string eventName)',
  'event SponsorshipClaimed(uint256 indexed id, address indexed host)',
  'event SponsorshipFunded(uint256 indexed id, address indexed sponsor, uint256 amount)',
  'event EventDetailsSet(uint256 indexed id, uint256 eventDate, int256 lat, int256 lng)',
  'event GuestCheckedIn(uint256 indexed id, address indexed guest)',
  'event VoteCast(uint256 indexed id, address indexed voter, bool yes)',
  'event SponsorshipCompleted(uint256 indexed id, address indexed host, uint256 amount)',
  'event SponsorshipRefunded(uint256 indexed id, address indexed sponsor, uint256 amount)',
  'event SponsorshipCancelled(uint256 indexed id)',
]);

// WMON ABI for approvals
export const wmonAbi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

// Status enum mapping
export const SponsorshipStatus = {
  0: 'AwaitingHost',
  1: 'AwaitingSponsor',
  2: 'Active',
  3: 'CheckingIn',
  4: 'Voting',
  5: 'Completed',
  6: 'Refunded',
  7: 'Cancelled',
} as const;

export type SponsorshipStatusName = typeof SponsorshipStatus[keyof typeof SponsorshipStatus];

export interface SponsorshipData {
  id: number;
  sponsor: Address;
  host: Address;
  amount: string;
  amountFormatted: string;
  eventName: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  eventDate: number;
  expectedGuests: number;
  checkInStart: number;
  checkInEnd: number;
  votingDeadline: number;
  createdAt: number;
  status: SponsorshipStatusName;
  statusCode: number;
  checkedInCount: number;
  yesVotes: number;
  noVotes: number;
}

export function getContractAddress(): Address {
  if (!EVENT_SPONSORSHIP_ADDRESS) {
    throw new Error('NEXT_PUBLIC_EVENT_SPONSORSHIP not configured');
  }
  return EVENT_SPONSORSHIP_ADDRESS;
}

export function getWmonAddress(): Address {
  if (!WMON_ADDRESS) {
    throw new Error('NEXT_PUBLIC_WMON not configured');
  }
  return WMON_ADDRESS;
}

// Read sponsorship from contract
export async function readSponsorship(id: number): Promise<SponsorshipData | null> {
  try {
    const result = await publicClient.readContract({
      address: getContractAddress(),
      abi: eventSponsorshipAbi,
      functionName: 'getSponsorship',
      args: [BigInt(id)],
    }) as any;

    if (result.sponsor === '0x0000000000000000000000000000000000000000' &&
        result.host === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      id,
      sponsor: result.sponsor,
      host: result.host,
      amount: result.amount.toString(),
      amountFormatted: formatEther(result.amount),
      eventName: result.eventName,
      city: result.city,
      country: result.country,
      latitude: Number(result.latitude) / 1e6,
      longitude: Number(result.longitude) / 1e6,
      eventDate: Number(result.eventDate),
      expectedGuests: Number(result.expectedGuests),
      checkInStart: Number(result.checkInStart),
      checkInEnd: Number(result.checkInEnd),
      votingDeadline: Number(result.votingDeadline),
      createdAt: Number(result.createdAt),
      status: SponsorshipStatus[result.status as keyof typeof SponsorshipStatus],
      statusCode: result.status,
      checkedInCount: Number(result.checkedInCount),
      yesVotes: Number(result.yesVotes),
      noVotes: Number(result.noVotes),
    };
  } catch (error) {
    console.error('[EventSponsorship] Error reading sponsorship:', error);
    return null;
  }
}

// Get total sponsorships count
export async function getTotalSponsorships(): Promise<number> {
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: eventSponsorshipAbi,
    functionName: 'getTotalSponsorships',
  });
  return Number(result);
}

// Get all sponsorships (paginated)
export async function getAllSponsorships(limit = 50, offset = 0): Promise<SponsorshipData[]> {
  const total = await getTotalSponsorships();
  const sponsorships: SponsorshipData[] = [];

  const start = Math.max(1, total - offset - limit + 1);
  const end = Math.min(total, total - offset);

  for (let i = end; i >= start; i--) {
    const s = await readSponsorship(i);
    if (s) sponsorships.push(s);
  }

  return sponsorships;
}

// Check if user is checked in
export async function checkIsCheckedIn(id: number, user: Address): Promise<boolean> {
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: eventSponsorshipAbi,
    functionName: 'hasCheckedIn',
    args: [BigInt(id), user],
  });
  return result as boolean;
}

// Check if user has voted
export async function checkHasVoted(id: number, user: Address): Promise<boolean> {
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: eventSponsorshipAbi,
    functionName: 'hasVoted',
    args: [BigInt(id), user],
  });
  return result as boolean;
}

// Oracle: Check in guest
export async function oracleCheckInGuest(id: number, guest: Address): Promise<string> {
  const walletClient = getOracleWalletClient();

  const hash = await walletClient.writeContract({
    address: getContractAddress(),
    abi: eventSponsorshipAbi,
    functionName: 'checkInFor',
    args: [BigInt(id), guest],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Oracle: Set event details
export async function oracleSetEventDetails(
  id: number,
  eventDate: number,
  latitude: number,
  longitude: number
): Promise<string> {
  const walletClient = getOracleWalletClient();

  const hash = await walletClient.writeContract({
    address: getContractAddress(),
    abi: eventSponsorshipAbi,
    functionName: 'setEventDetails',
    args: [
      BigInt(id),
      BigInt(eventDate),
      BigInt(Math.round(latitude * 1e6)),
      BigInt(Math.round(longitude * 1e6)),
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
