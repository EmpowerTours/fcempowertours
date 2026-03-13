import { keccak256, encodePacked } from 'viem';
import { Redis } from '@upstash/redis';

export const RIGHTS_AGREEMENT_VERSION = '1.0';

export const RIGHTS_AGREEMENT_TEXT = `EMPOWERTOURS DIRECT ARTIST LICENSING AGREEMENT
Version {{VERSION}} | Date: {{DATE}}

PARTIES
Platform: EmpowerTours (fcempowertours.vercel.app)
Artist: {{ARTIST_ADDRESS}} (Farcaster FID: {{ARTIST_FID}})

DECLARATIONS
The Artist hereby declares and warrants that:

1. PRO AFFILIATION: The Artist is NOT a member of any Performing Rights Organization (PRO) including but not limited to ASCAP, BMI, SESAC, GMR, or any international equivalent. The Artist has not registered the Work with any PRO or collective management organization.

2. COMPOSITION OWNERSHIP: The Artist is the sole author and copyright owner of the musical composition (melody, harmony, lyrics) embodied in the Work, or has obtained all necessary rights from co-authors.

3. MASTER RECORDING OWNERSHIP: The Artist is the sole owner of the master recording (sound recording) of the Work, or has obtained all necessary rights from any co-owners, producers, or featured artists.

4. SAMPLE CLEARANCE: {{SAMPLES_DECLARATION}}

5. ISRC CODE: {{ISRC_DECLARATION}}

LICENSE GRANT
The Artist hereby grants to EmpowerTours a non-exclusive, worldwide, perpetual license to:

a) PERFORMANCE RIGHT: Stream the Work via EmpowerTours Live Radio and on-demand artist pages to registered platform users.

b) MECHANICAL RIGHT: Make server-side reproductions of the Work as necessary to facilitate streaming delivery, caching, and format conversion.

c) MASTER USE RIGHT: Use the master recording of the Work for all streaming purposes described above, including promotional clips of up to 30 seconds.

COMPENSATION
- The Artist retains 90% of all WMON license sales revenue.
- The Artist receives a proportional share of the monthly WMON streaming pool (70% of all subscription revenue), calculated as (Artist's play count / Total platform plays) x Artist Pool.
- 20% of subscription revenue is allocated to the Listener Reward Pool (ListenerRewardPool contract). Active radio listeners — including artists who listen — earn WMON proportional to songs heard each month. Artists who are also active listeners may earn up to 90% of subscription revenue (70% artist pool + 20% listener pool).
- 10% of subscription revenue is allocated to the platform treasury.
- The Artist receives 100% of WMON tips sent by fans through the platform.
- Eligible artists (10+ master NFTs, 100+ lifetime plays) may claim monthly TOURS rewards via the ToursRewardManager.
- This license does not transfer any ownership rights in the Work.

REVOCATION
The Artist may revoke this license at any time by contacting platform administrators. Revocation will take effect within 48 hours and will not affect licenses already sold to individual users.

REPRESENTATIONS
The Artist represents that granting this license does not violate any existing agreement, and that no third party has a claim to the rights granted herein.

TOKEN ID: {{TOKEN_ID}}
RIGHTS AGREEMENT HASH: {{AGREEMENT_HASH}}
MINTED ON: Monad Mainnet (Chain ID: 143)`;

export interface RightsDeclaration {
  notPro: boolean;
  ownsComposition: boolean;
  ownsMaster: boolean;
  grantsPerformance: boolean;
  grantsMechanical: boolean;
  grantsMasterUse: boolean;
  containsSamples: boolean;
  samplesCleared: boolean;
  isrcCode: string;
  artistAddress: string;
  artistFid: string | number;
  accepted: boolean;
  acceptedAt: string;
}

export interface RightsStatus {
  status: 'cleared' | 'pending' | 'revoked';
  version: string;
  agreementCid: string;
  agreementHash: string;
  declaration: RightsDeclaration;
  tokenId: string;
  storedAt: string;
}

export function generateAgreementHash(
  agreementText: string,
  fid: string | number,
  address: string
): string {
  return keccak256(
    encodePacked(
      ['string', 'uint256', 'address'],
      [agreementText, BigInt(fid), address as `0x${string}`]
    )
  );
}

export function buildFilledAgreement(
  declaration: RightsDeclaration,
  tokenId?: string,
  agreementHash?: string
): string {
  const samplesText = declaration.containsSamples
    ? declaration.samplesCleared
      ? 'The Work contains samples from third-party recordings. The Artist has obtained all necessary clearances and licenses for these samples.'
      : 'The Work contains samples. Clearance status: PENDING.'
    : 'The Work does NOT contain any samples from third-party recordings.';

  const isrcText = declaration.isrcCode
    ? `ISRC: ${declaration.isrcCode}`
    : 'No ISRC code provided.';

  return RIGHTS_AGREEMENT_TEXT
    .replace('{{VERSION}}', RIGHTS_AGREEMENT_VERSION)
    .replace('{{DATE}}', declaration.acceptedAt || new Date().toISOString())
    .replace('{{ARTIST_ADDRESS}}', declaration.artistAddress)
    .replace('{{ARTIST_FID}}', String(declaration.artistFid))
    .replace('{{SAMPLES_DECLARATION}}', samplesText)
    .replace('{{ISRC_DECLARATION}}', isrcText)
    .replace('{{TOKEN_ID}}', tokenId || 'PENDING')
    .replace('{{AGREEMENT_HASH}}', agreementHash || 'PENDING');
}

export async function storeRightsStatus(
  redis: Redis,
  tokenId: string,
  declaration: RightsDeclaration,
  agreementCid: string = '',
  agreementHash: string = ''
): Promise<void> {
  const status: RightsStatus = {
    status: 'cleared',
    version: RIGHTS_AGREEMENT_VERSION,
    agreementCid,
    agreementHash,
    declaration,
    tokenId,
    storedAt: new Date().toISOString(),
  };

  await redis.set(`rights:status:${tokenId}`, JSON.stringify(status));
}

export async function getRightsStatus(
  redis: Redis,
  tokenId: string
): Promise<RightsStatus | null> {
  const data = await redis.get<string>(`rights:status:${tokenId}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as RightsStatus;
}

export async function hasRightsClearance(
  redis: Redis,
  tokenId: string
): Promise<boolean> {
  const status = await getRightsStatus(redis, tokenId);
  // Legacy NFTs (no record) pass through
  if (!status) return true;
  return status.status === 'cleared';
}

/**
 * Get all tokenIds with explicit 'cleared' rights status.
 * Used by Venue Player to build the PRO-free catalog.
 * Unlike hasRightsClearance(), this does NOT pass legacy NFTs through.
 */
export async function getClearedTokenIds(redis: Redis): Promise<string[]> {
  // Scan for all rights:status:* keys
  const cleared: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'rights:status:*', count: 100 });
    cursor = typeof nextCursor === 'string' ? parseInt(nextCursor) : nextCursor;

    for (const key of keys) {
      const tokenId = (key as string).replace('rights:status:', '');
      const status = await getRightsStatus(redis, tokenId);
      if (status && status.status === 'cleared') {
        cleared.push(tokenId);
      }
    }
  } while (cursor !== 0);

  return cleared;
}
