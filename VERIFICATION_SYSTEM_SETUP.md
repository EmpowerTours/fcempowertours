# Personal Assistant Verification System - Setup Guide

## Overview

This system implements secure, multi-path verification for personal assistants with encrypted document storage that only the platform owner can access.

## Architecture

### Verification Paths

1. **Stake-Based (100 MON)** - Instant access, 3% fee → 2% after 10 jobs
2. **Web3 Identity** - Free, requires verification proof, 5% fee → 2% after 10 jobs
3. **Manual Verification** - Free, manual review, 2% fee from start

### Security Model

- Documents are encrypted using AES-256-GCM on the server
- Encrypted documents stored in private database (not IPFS)
- Only document hash stored on-chain as proof of submission
- Only platform owner can decrypt and view documents via admin panel
- Owner must sign messages with wallet to prove identity

## Setup Instructions

### 1. Generate Encryption Key

Run this Node.js script ONCE to generate your encryption key:

```javascript
// generate-key.js
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('hex');
console.log('DOCUMENT_ENCRYPTION_KEY=' + key);
```

```bash
node generate-key.js
```

**CRITICAL:** Store this key securely! If you lose it, you cannot decrypt existing documents.

### 2. Environment Variables

Add to your `.env.local`:

```env
# Encryption key (generated above)
DOCUMENT_ENCRYPTION_KEY=your_generated_key_here

# Platform owner address (your wallet)
PLATFORM_SAFE_ADDRESS=0xYourWalletAddress

# Personal Assistant contract (after deployment)
NEXT_PUBLIC_PERSONAL_ASSISTANT=0xContractAddress
```

### 3. Deploy PersonalAssistant Contract

```bash
cd contracts

# Deploy to testnet
forge script script/DeployPersonalAssistant.s.sol:DeployPersonalAssistant \
  --rpc-url $MONAD_TESTNET_RPC \
  --broadcast \
  --verify

# Or deploy to mainnet
forge script script/DeployPersonalAssistant.s.sol:DeployPersonalAssistant \
  --rpc-url $MONAD_MAINNET_RPC \
  --broadcast \
  --verify
```

Copy the deployed contract address to `NEXT_PUBLIC_PERSONAL_ASSISTANT` in `.env.local`.

### 4. Install Dependencies

```bash
npm install uuid
# or
yarn add uuid
```

### 5. Database Setup

Currently using in-memory storage (Map). For production, replace with:

- PostgreSQL with encrypted columns
- MongoDB with encryption at rest
- AWS S3 with server-side encryption
- Any secure database solution

Update `/lib/db/verificationDocuments.ts` to use your database.

## Usage Flow

### For Assistants

1. Visit `/become-assistant`
2. Choose verification path:
   - **Stake**: Pay 100 MON, start working immediately
   - **Web3**: Upload Web3 identity proof, wait for approval
   - **Manual**: Upload government ID, wait for manual review (24-48 hours)
3. Upload verification document (encrypted automatically)
4. Submit registration transaction
5. Wait for approval (if applicable)
6. Start accepting service requests

### For Platform Owner (You)

1. Visit `/admin/verify-assistants`
2. View pending verification applications
3. Click on application to decrypt and view document
4. Review document (government ID, verification proof, etc.)
5. Approve or reject with optional notes
6. Approved assistants can now accept service requests

## Security Features

### Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Size**: 256 bits (32 bytes)
- **IV**: Randomly generated per document
- **Auth Tag**: Ensures data integrity

### Access Control

- Admin endpoints verify wallet signature
- Only `PLATFORM_SAFE_ADDRESS` can access
- Message signing proves ownership
- Time-stamped signatures prevent replay attacks

### Data Privacy

- Documents NEVER stored in plain text
- Documents NEVER uploaded to IPFS or blockchain
- Only hash stored on-chain (proof of submission)
- GDPR compliant (can delete on request)

## Smart Contract Integration

### Register with Stake (100 MON)

```typescript
import { parseEther } from 'viem';

writeContract({
  address: PERSONAL_ASSISTANT_ADDRESS,
  abi: PersonalAssistantABI,
  functionName: 'registerWithStake',
  value: parseEther('100'), // 100 MON stake
});
```

### Register with Web3 Identity

```typescript
writeContract({
  address: PERSONAL_ASSISTANT_ADDRESS,
  abi: PersonalAssistantABI,
  functionName: 'registerWithWeb3Identity',
  args: [documentHash], // Hash from upload API
});
```

### Register for Manual Verification

```typescript
writeContract({
  address: PERSONAL_ASSISTANT_ADDRESS,
  abi: PersonalAssistantABI,
  functionName: 'registerForManualVerification',
  args: [documentHash], // Hash from upload API
});
```

### Approve Assistant (Owner Only)

```typescript
writeContract({
  address: PERSONAL_ASSISTANT_ADDRESS,
  abi: PersonalAssistantABI,
  functionName: 'approveAssistant',
  args: [assistantAddress],
});
```

## API Endpoints

### POST /api/submit-verification-docs

Upload and encrypt verification document.

**Request:**
```typescript
FormData {
  file: File,
  assistantAddress: string,
  documentType: 'government_id' | 'web3_verification' | 'proof_of_identity'
}
```

**Response:**
```json
{
  "success": true,
  "documentId": "uuid",
  "documentHash": "0x...",
  "message": "Document encrypted and stored securely"
}
```

### GET /api/admin/review-verification

Fetch pending verification applications (admin only).

**Headers:**
- `x-wallet-address`: Owner wallet address
- `x-signature`: Signed message
- `x-message`: Original message

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "assistantAddress": "0x...",
      "documentType": "government_id",
      "uploadedAt": "2025-01-15T10:30:00Z",
      "mimeType": "image/jpeg"
    }
  ]
}
```

### POST /api/admin/review-verification

Decrypt, view, or review a document (admin only).

**Actions:**

1. **View Document:**
```json
{
  "documentId": "uuid",
  "action": "view",
  "address": "0x...",
  "signature": "0x...",
  "message": "..."
}
```

2. **Approve/Reject:**
```json
{
  "documentId": "uuid",
  "action": "approve", // or "reject"
  "address": "0x...",
  "signature": "0x...",
  "message": "...",
  "notes": "Optional review notes"
}
```

## Verification Tiers & Fees

| Tier | Initial Fee | After 10 Jobs | Stake Required |
|------|-------------|---------------|----------------|
| Stake-Based | 3% | 2% | 100 MON (refundable) |
| Web3 Identity | 5% | 2% | None |
| Manual Verification | 2% | 2% | None |
| Community Verified | 2% | 2% | None (auto-upgrade) |

### Auto-Upgrade Conditions

After completing 10 successful jobs with 4.5+ rating:
- Stake returned (if applicable)
- Fee reduced to 2%
- Tier upgraded to "Community Verified"

## Files Created

### Smart Contracts
- `/contracts/contracts/PersonalAssistantV1.sol` - Main contract
- `/contracts/script/DeployPersonalAssistant.s.sol` - Deployment script

### Backend
- `/lib/encryption.ts` - AES-256-GCM encryption utilities
- `/lib/db/verificationDocuments.ts` - Database schema & queries
- `/app/api/submit-verification-docs/route.ts` - Upload endpoint
- `/app/api/admin/review-verification/route.ts` - Admin review endpoint

### Frontend
- `/app/become-assistant/page.tsx` - Assistant registration UI
- `/app/admin/verify-assistants/page.tsx` - Admin verification dashboard

## Next Steps

1. ✅ Generate encryption key
2. ✅ Set environment variables
3. ✅ Deploy PersonalAssistant contract
4. ✅ Test assistant registration flow
5. ✅ Test admin review flow
6. 🔄 Replace in-memory storage with production database
7. 🔄 Add email notifications for approvals/rejections
8. 🔄 Build assistant dashboard to view service requests
9. 🔄 Integrate with existing experience/itinerary system

## Security Recommendations

1. **Encryption Key Storage:**
   - Use AWS Secrets Manager, HashiCorp Vault, or similar
   - Never commit to git
   - Rotate periodically
   - Use different keys for dev/staging/production

2. **Database Security:**
   - Enable encryption at rest
   - Use SSL/TLS for connections
   - Restrict access by IP whitelist
   - Regular backups with encryption

3. **Access Logging:**
   - Log all document decryption attempts
   - Alert on unusual access patterns
   - Audit trail for compliance

4. **Data Retention:**
   - Define retention policy (e.g., 7 years)
   - Implement secure deletion
   - Handle GDPR deletion requests

## Support

For questions or issues:
- Review this documentation
- Check smart contract comments
- Test on testnet first
- Never share encryption key

---

**Created:** 2025-01-15
**Version:** 1.0
**Status:** Ready for deployment
