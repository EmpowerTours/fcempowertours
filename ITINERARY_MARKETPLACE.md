# Itinerary NFT Marketplace - Implementation Guide

## Overview

The Itinerary NFT Marketplace is a complete end-to-end feature for EmpowerTours that allows users to create, browse, purchase, and check in to travel experiences. When users check in at a location (verified by GPS), they receive a passport stamp on their Passport NFT.

## Features Implemented

### 1. Core Utilities

**GPS Utilities** (`/lib/utils/gps.ts`)
- Haversine formula for distance calculation
- Browser geolocation API integration
- Proximity verification
- Distance formatting
- Coordinate validation

**Pinata IPFS Upload** (`/lib/utils/pinata.ts`)
- Server-side image upload
- Client-side upload helper
- JSON metadata upload
- File validation
- Gateway URL generation

### 2. API Endpoints

**IPFS Upload API** (`/app/api/upload-to-ipfs/route.ts`)
- Secure server-side Pinata upload
- File type validation (images only)
- Size limit enforcement (10MB max)
- Error handling

**Delegation API Actions** (`/app/api/execute-delegated/route.ts`)
- `create_itinerary`: Creates new experience with metadata
- `purchase_itinerary`: Purchases experience with TOURS tokens
- `checkin_itinerary`: GPS-verified check-in with passport stamping

### 3. Frontend Pages

**Itinerary Marketplace** (`/app/itinerary-market/page.tsx`)
- Browse mode: Grid view with filters
- Create mode: Full form with image upload
- Detail mode: Experience details with purchase button
- Filters: Country, city, type, price range
- GPS integration for location detection
- Gasless transactions via delegation

### 4. Passport Enhancement

**Passport SVG with Stamps** (`/lib/passport/generatePassportSVG.ts`)
- Dynamic stamp rendering (max 6 visible)
- Stamp layout: 3x2 grid at bottom of passport
- Each stamp shows: flag emoji, city name, date
- "Plus more" indicator for >6 stamps
- Stamps update on metadata refresh

### 5. Envio Integration

**Updated Config** (`/empowertours-envio/config.yaml`)
- `ItineraryCreated` event indexing
- `ItineraryPurchased` event indexing
- `PassportStamped` event indexing
- GraphQL query support for all events

### 6. Testing Infrastructure

**E2E Test Script** (`/scripts/test-itinerary-marketplace.ts`)
- Automated test flow for 3 users
- Passport minting
- Itinerary creation (3 locations)
- Cross-purchases
- GPS-simulated check-ins
- Stamp verification
- Markdown test report generation

## File Structure

```
/home/empowertours/projects/fcempowertours/
├── app/
│   ├── api/
│   │   ├── execute-delegated/
│   │   │   └── route.ts (+ itinerary actions)
│   │   └── upload-to-ipfs/
│   │       └── route.ts (new)
│   └── itinerary-market/
│       └── page.tsx (new)
├── lib/
│   ├── abis/
│   │   └── ItineraryNFT.json (new)
│   ├── passport/
│   │   └── generatePassportSVG.ts (updated)
│   └── utils/
│       ├── gps.ts (new)
│       └── pinata.ts (new)
├── empowertours-envio/
│   └── config.yaml (updated)
└── scripts/
    └── test-itinerary-marketplace.ts (new)
```

## Contract Integration

### ItineraryNFT Contract
**Address:** `0x5B61286AC88688fe8930711fAa5b1155e98daFe8`

**Key Functions:**
- `createExperience()`: Mint itinerary NFT with location data
- `purchaseExperience()`: Buy experience with TOURS tokens
- `checkIn()`: GPS-verified check-in that stamps passport

**Events:**
- `ItineraryCreated`: Emitted when new experience created
- `ItineraryPurchased`: Emitted when experience purchased
- `PassportStamped`: Emitted when user checks in

## Testing Instructions

### Prerequisites
1. Ensure Envio is running and indexing
2. Ensure Safe account has MON for gas
3. Ensure test users have TOURS tokens
4. Pinata credentials in `.env.local`

### Running Tests

```bash
# Run the comprehensive test suite
npx tsx scripts/test-itinerary-marketplace.ts

# The script will:
# 1. Generate 3 test users (Alice, Bob, Charlie)
# 2. Mint passports for each user
# 3. Create 3 itineraries in different locations
# 4. Execute cross-purchases
# 5. Simulate GPS check-ins
# 6. Verify passport stamps
# 7. Generate TEST_RESULTS.md with full report
```

### Manual Testing

1. **Create Experience:**
   - Go to `/itinerary-market`
   - Click "Create" tab
   - Fill in location details
   - Upload image (optional)
   - Use "Get Current Location" for GPS
   - Click "Create Experience (FREE)"

2. **Browse & Purchase:**
   - Click "Browse" tab
   - Apply filters if desired
   - Click on an itinerary card
   - Review details
   - Click "Purchase Experience"

3. **Check In:**
   - Must have purchased the experience
   - Must have a passport NFT
   - Must be within proximity radius
   - (Feature to be added to detail page)

## Environment Variables

Required in `.env.local`:
```bash
NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
NEXT_PUBLIC_PASSPORT=0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PINATA_GATEWAY=harlequin-used-hare-224.mypinata.cloud
NEXT_PUBLIC_ENVIO_ENDPOINT=https://indexer.dev.hyperindex.xyz/5e18e81/v1/graphql
```

## GraphQL Queries

### Get All Itineraries
```graphql
query GetAllItineraries {
  ItineraryNFT_ItineraryCreated(order_by: {block_timestamp: desc}) {
    tokenId
    creator
    name
    description
    price
  }
}
```

### Get Passport Stamps
```graphql
query GetPassportStamps($passportId: String!) {
  ItineraryNFT_PassportStamped(where: {passportTokenId: {_eq: $passportId}}) {
    itineraryId
    locationName
    city
    country
    timestamp
  }
}
```

## User Flow

### Creating an Experience
1. User connects wallet
2. User fills in experience details
3. User uploads image (optional)
4. User gets current GPS location
5. Image uploads to IPFS via Pinata
6. Delegation API creates itinerary NFT
7. Experience appears in marketplace

### Purchasing an Experience
1. User browses marketplace
2. User clicks on experience
3. User reviews details and price
4. User clicks purchase
5. Delegation API approves TOURS and purchases
6. Experience is now owned by user

### Checking In
1. User must own the experience
2. User must have a passport NFT
3. User navigates to location
4. User requests check-in
5. GPS coordinates verified
6. Delegation API stamps passport
7. Stamp appears on passport SVG

## Known Issues & Future Enhancements

### To Implement:
- [ ] Check-in button on detail page
- [ ] User's purchased experiences page
- [ ] Reviews and ratings system
- [ ] Map view for itineraries
- [ ] Search by GPS radius
- [ ] Experience categories/tags
- [ ] Social sharing

### Known Limitations:
- GPS accuracy depends on device
- IPFS images require gateway
- Envio indexing delay (2-5 seconds)
- Test script uses mock private keys

## Security Considerations

1. **GPS Verification:**
   - Server-side distance calculation
   - Contract also validates proximity
   - Prevent spoofing with multiple checks

2. **Image Uploads:**
   - Server-side validation
   - File type restrictions
   - Size limits enforced
   - API keys server-side only

3. **Delegation:**
   - Permission-based actions
   - Transaction limits
   - Expiration enforcement

## Performance

- IPFS uploads: 1-3 seconds
- Transaction execution: 2-5 seconds
- Envio indexing: 2-5 seconds
- Total flow (create): ~10 seconds
- Total flow (purchase): ~5 seconds
- Total flow (check-in): ~5 seconds

## Support

For issues or questions:
1. Check transaction hash on Monad explorer
2. Verify Envio indexing status
3. Check browser console for errors
4. Review TEST_RESULTS.md for details
5. Contact team with transaction hashes

---

**Last Updated:** 2025-11-17
**Version:** 1.0.0
**Status:** Ready for Testing
