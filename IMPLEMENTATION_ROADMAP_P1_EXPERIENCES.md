# PRIORITY 1: Experience + GPS + Transportation Integration

## Implementation Roadmap

**Status:** Ready to Build
**Priority:** 🔥 HIGHEST (Build This First!)
**Estimated Timeline:** 4-6 weeks
**Dependencies:** ServiceMarketplace (already built!)

---

## Overview

The **complete travel experience loop:**

```
1. Browse Experience NFTs
   ↓
2. Mint Experience (pay in MON)
   ↓
3. GPS Location Revealed
   ↓
4. "Schedule Transportation?" Button
   ↓
5. Book Ride to Location
   ↓
6. Driver Takes You There
   ↓
7. Complete Experience (GPS Check-In)
   ↓
8. Earn Completion Reward
   ↓
9. Share on Farcaster
```

**This is the KILLER FEATURE that ties everything together!**

---

## Phase 1: Experience NFT Contract (Week 1-2)

### Smart Contract: ExperienceNFT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ExperienceNFT
 * @notice Mint travel experiences, GPS reveals on mint, earn rewards on completion
 */
contract ExperienceNFT is ERC721, Ownable {

    struct Experience {
        uint256 experienceId;
        string title;
        string description;
        string category;            // "Cultural", "Adventure", "Food", "Music"
        uint256 price;              // in WMON

        // GPS data (revealed after mint)
        int256 latitude;            // Stored as fixed-point (multiply by 1e6)
        int256 longitude;
        string locationName;        // "Accra, Ghana"
        string addressHint;         // "Near Independence Square"

        // Creator info
        address creator;            // Tour operator or artist
        uint256 creatorRoyalty;     // Percentage (e.g., 10 = 10%)

        // Completion mechanics
        uint256 rewardAmount;       // WMON earned on completion
        string completionProofType; // "GPS_CHECK_IN", "PHOTO", "QR_CODE"
        uint256 completionRadius;   // Meters (e.g., 100m from coordinates)

        // Metadata
        string imageUrl;            // IPFS hash of experience image
        string[] tags;              // ["outdoor", "music", "food"]
        bool isActive;
        uint256 createdAt;
    }

    struct UserExperience {
        uint256 tokenId;
        uint256 experienceId;
        address owner;
        uint256 mintedAt;
        bool completed;
        uint256 completedAt;
        string completionProofHash; // IPFS hash of photo/proof
    }

    // State
    mapping(uint256 => Experience) public experiences;      // experienceId => Experience
    mapping(uint256 => UserExperience) public userExperiences; // tokenId => UserExperience
    mapping(uint256 => uint256) public experienceToTokenCount; // experienceId => total mints

    uint256 private _experienceIdCounter;
    uint256 private _tokenIdCounter;

    IERC20 public wmonToken;
    address public platformSafe;
    uint256 public platformFeePercent = 5; // 5% platform fee

    // Events
    event ExperienceCreated(uint256 indexed experienceId, string title, address creator, uint256 price);
    event ExperienceMinted(uint256 indexed tokenId, uint256 indexed experienceId, address owner);
    event ExperienceCompleted(uint256 indexed tokenId, address indexed owner, uint256 reward);

    constructor(
        address _wmonToken,
        address _platformSafe
    ) ERC721("EmpowerTours Experience", "ETEXP") Ownable(msg.sender) {
        wmonToken = IERC20(_wmonToken);
        platformSafe = _platformSafe;
    }

    /**
     * @dev Create new experience (tour operators, artists)
     */
    function createExperience(
        string memory title,
        string memory description,
        string memory category,
        uint256 price,
        int256 latitude,            // e.g., 5_603_717 for 5.603717°
        int256 longitude,           // e.g., -274_000 for -0.274000°
        string memory locationName,
        string memory addressHint,
        uint256 rewardAmount,
        string memory completionProofType,
        uint256 completionRadius,
        string memory imageUrl,
        string[] memory tags,
        uint256 creatorRoyalty
    ) external returns (uint256 experienceId) {
        require(price > 0, "Price must be > 0");
        require(creatorRoyalty <= 50, "Royalty too high"); // Max 50%

        experienceId = _experienceIdCounter++;

        Experience storage exp = experiences[experienceId];
        exp.experienceId = experienceId;
        exp.title = title;
        exp.description = description;
        exp.category = category;
        exp.price = price;
        exp.latitude = latitude;
        exp.longitude = longitude;
        exp.locationName = locationName;
        exp.addressHint = addressHint;
        exp.creator = msg.sender;
        exp.creatorRoyalty = creatorRoyalty;
        exp.rewardAmount = rewardAmount;
        exp.completionProofType = completionProofType;
        exp.completionRadius = completionRadius;
        exp.imageUrl = imageUrl;
        exp.tags = tags;
        exp.isActive = true;
        exp.createdAt = block.timestamp;

        emit ExperienceCreated(experienceId, title, msg.sender, price);

        return experienceId;
    }

    /**
     * @dev Mint experience NFT (user buys experience)
     * @notice GPS coordinates revealed after minting
     */
    function mintExperience(uint256 experienceId) external returns (uint256 tokenId) {
        Experience storage exp = experiences[experienceId];
        require(exp.isActive, "Experience not active");

        tokenId = _tokenIdCounter++;

        // Calculate payment split
        uint256 platformFee = (exp.price * platformFeePercent) / 100;
        uint256 creatorAmount = exp.price - platformFee;

        // Transfer WMON payment
        require(
            wmonToken.transferFrom(msg.sender, exp.creator, creatorAmount),
            "Creator payment failed"
        );
        require(
            wmonToken.transferFrom(msg.sender, platformSafe, platformFee),
            "Platform fee failed"
        );

        // Mint NFT
        _safeMint(msg.sender, tokenId);

        // Store user experience
        UserExperience storage userExp = userExperiences[tokenId];
        userExp.tokenId = tokenId;
        userExp.experienceId = experienceId;
        userExp.owner = msg.sender;
        userExp.mintedAt = block.timestamp;
        userExp.completed = false;

        experienceToTokenCount[experienceId]++;

        emit ExperienceMinted(tokenId, experienceId, msg.sender);

        return tokenId;
    }

    /**
     * @dev Complete experience (GPS check-in or photo proof)
     * @param tokenId The experience NFT token ID
     * @param userLat User's current latitude (× 1e6)
     * @param userLon User's current longitude (× 1e6)
     * @param proofHash IPFS hash of completion proof (photo, etc.)
     */
    function completeExperience(
        uint256 tokenId,
        int256 userLat,
        int256 userLon,
        string memory proofHash
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        UserExperience storage userExp = userExperiences[tokenId];
        require(!userExp.completed, "Already completed");

        Experience storage exp = experiences[userExp.experienceId];

        // Verify GPS proximity (simplified Haversine)
        uint256 distance = calculateDistance(
            exp.latitude,
            exp.longitude,
            userLat,
            userLon
        );

        require(distance <= exp.completionRadius, "Not at location");

        // Mark as completed
        userExp.completed = true;
        userExp.completedAt = block.timestamp;
        userExp.completionProofHash = proofHash;

        // Award completion reward
        if (exp.rewardAmount > 0) {
            require(
                wmonToken.transfer(msg.sender, exp.rewardAmount),
                "Reward transfer failed"
            );
        }

        emit ExperienceCompleted(tokenId, msg.sender, exp.rewardAmount);
    }

    /**
     * @dev Calculate distance between two GPS coordinates (simplified)
     * @return distance in meters
     */
    function calculateDistance(
        int256 lat1,
        int256 lon1,
        int256 lat2,
        int256 lon2
    ) public pure returns (uint256) {
        // Simplified distance calculation (Manhattan distance)
        // For production, use proper Haversine or Vincenty formula
        int256 latDiff = lat1 > lat2 ? lat1 - lat2 : lat2 - lat1;
        int256 lonDiff = lon1 > lon2 ? lon1 - lon2 : lon2 - lon1;

        // Rough approximation: 1 degree ≈ 111km
        uint256 distance = uint256((latDiff + lonDiff) * 111000 / 1000000);

        return distance;
    }

    /**
     * @dev Get experience details
     */
    function getExperience(uint256 experienceId) external view returns (Experience memory) {
        return experiences[experienceId];
    }

    /**
     * @dev Get user's minted experience details
     */
    function getUserExperience(uint256 tokenId) external view returns (
        UserExperience memory userExp,
        Experience memory exp
    ) {
        userExp = userExperiences[tokenId];
        exp = experiences[userExp.experienceId];
        return (userExp, exp);
    }

    /**
     * @dev Get all active experiences (for browsing)
     */
    function getActiveExperiences() external view returns (Experience[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < _experienceIdCounter; i++) {
            if (experiences[i].isActive) activeCount++;
        }

        Experience[] memory active = new Experience[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < _experienceIdCounter; i++) {
            if (experiences[i].isActive) {
                active[index] = experiences[i];
                index++;
            }
        }

        return active;
    }

    /**
     * @dev Get user's owned experiences
     */
    function getUserOwnedExperiences(address user) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(user);
        uint256[] memory tokenIds = new uint256[](balance);

        for (uint256 i = 0; i < balance; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(user, i);
        }

        return tokenIds;
    }

    // Admin functions
    function setRewardAmount(uint256 experienceId, uint256 newReward) external onlyOwner {
        experiences[experienceId].rewardAmount = newReward;
    }

    function fundRewards(uint256 amount) external {
        require(wmonToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }
}
```

---

## Phase 2: Frontend Implementation (Week 3-4)

### Component 1: Experience Browse Page

```typescript
// app/experiences/page.tsx

'use client';

import { useState } from 'react';
import { useExperiences, useUserLocation } from '@/hooks';
import { calculateDistance } from '@/utils/distance';
import { formatMON } from '@/utils/tokenDisplay';

export default function ExperiencesPage() {
  const [filter, setFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'price' | 'distance' | 'popular'>('distance');

  const { data: experiences, isLoading } = useExperiences();
  const userLocation = useUserLocation();

  // Filter by category
  const filteredExperiences = experiences?.filter(exp =>
    filter === 'all' ? true : exp.category === filter
  );

  // Sort
  const sortedExperiences = filteredExperiences?.sort((a, b) => {
    if (sortBy === 'price') return a.price - b.price;
    if (sortBy === 'popular') return b.totalMints - a.totalMints;
    if (sortBy === 'distance' && userLocation) {
      const distA = calculateDistance(
        userLocation.lat, userLocation.lon,
        a.latitude / 1e6, a.longitude / 1e6
      );
      const distB = calculateDistance(
        userLocation.lat, userLocation.lon,
        b.latitude / 1e6, b.longitude / 1e6
      );
      return distA - distB;
    }
    return 0;
  });

  return (
    <div className="experiences-page">
      <header>
        <h1>🌍 Discover Experiences</h1>
        <p>Mint adventures, reveal locations, earn rewards</p>
      </header>

      {/* Filters */}
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="Cultural">Cultural</option>
          <option value="Adventure">Adventure</option>
          <option value="Food">Food & Dining</option>
          <option value="Music">Music & Events</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="distance">Nearest First</option>
          <option value="price">Lowest Price</option>
          <option value="popular">Most Popular</option>
        </select>
      </div>

      {/* Experience Grid */}
      <div className="experience-grid">
        {sortedExperiences?.map(exp => (
          <ExperienceCard key={exp.experienceId} experience={exp} />
        ))}
      </div>
    </div>
  );
}

function ExperienceCard({ experience }) {
  const userLocation = useUserLocation();

  const distance = userLocation
    ? calculateDistance(
        userLocation.lat, userLocation.lon,
        experience.latitude / 1e6, experience.longitude / 1e6
      )
    : null;

  return (
    <div className="experience-card">
      <img src={experience.imageUrl} alt={experience.title} />

      <div className="card-content">
        <h3>{experience.title}</h3>
        <p className="category">{experience.category}</p>
        <p className="description">{experience.description}</p>

        {/* Location hint (NOT full GPS until minted!) */}
        <div className="location-hint">
          <p>📍 {experience.locationName}</p>
          {distance && <p className="distance">{distance.toFixed(1)} km away</p>}
        </div>

        <div className="tags">
          {experience.tags.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>

        <div className="pricing">
          <div className="price">
            <span className="amount">{formatMON(experience.price)}</span>
            <span className="label">Experience Price</span>
          </div>
          <div className="reward">
            <span className="amount">+{formatMON(experience.rewardAmount)}</span>
            <span className="label">Completion Reward</span>
          </div>
        </div>

        <button
          onClick={() => handleMintExperience(experience.experienceId)}
          className="btn-primary"
        >
          🎫 Mint Experience → Reveal GPS
        </button>
      </div>
    </div>
  );
}
```

### Component 2: Minted Experience Detail (With GPS!)

```typescript
// app/experiences/[tokenId]/page.tsx

'use client';

import { useState } from 'react';
import { useExperienceToken, useServiceMarketplace } from '@/hooks';
import { MapView } from '@/components/MapView';
import { estimateRideCost } from '@/constants/pricing';

export default function ExperienceDetailPage({ params }: { params: { tokenId: string } }) {
  const tokenId = parseInt(params.tokenId);
  const { data: experience, isLoading } = useExperienceToken(tokenId);
  const [showTransportOptions, setShowTransportOptions] = useState(false);

  if (isLoading || !experience) return <div>Loading...</div>;

  const { userExp, exp } = experience;
  const gpsLat = exp.latitude / 1e6;
  const gpsLon = exp.longitude / 1e6;

  // Calculate ride estimate
  const userLocation = useUserLocation();
  const distance = userLocation
    ? calculateDistance(userLocation.lat, userLocation.lon, gpsLat, gpsLon)
    : null;

  const rideCost = distance ? estimateRideCost('CAR', distance) : null;

  return (
    <div className="experience-detail">
      {/* Hero Image */}
      <img src={exp.imageUrl} alt={exp.title} className="hero-image" />

      {/* Experience Info */}
      <div className="info-section">
        <h1>{exp.title}</h1>
        <p className="description">{exp.description}</p>

        {!userExp.completed && (
          <div className="status-banner incomplete">
            <p>📍 Location Revealed! Ready to visit?</p>
          </div>
        )}

        {userExp.completed && (
          <div className="status-banner completed">
            <p>✅ Completed on {new Date(userExp.completedAt * 1000).toLocaleDateString()}</p>
            <p>🎉 You earned {formatMON(exp.rewardAmount)}!</p>
          </div>
        )}
      </div>

      {/* MAP - GPS Location Revealed! */}
      <div className="map-container">
        <h2>📍 Your Adventure Location</h2>
        <MapView
          center={{ lat: gpsLat, lon: gpsLon }}
          markers={[
            {
              lat: gpsLat,
              lon: gpsLon,
              title: exp.title,
              description: exp.addressHint,
              icon: '🎯'
            }
          ]}
          zoom={15}
        />

        <div className="location-details">
          <p className="location-name">{exp.locationName}</p>
          <p className="address-hint">{exp.addressHint}</p>
          {distance && (
            <p className="distance">📏 {distance.toFixed(2)} km from your location</p>
          )}
        </div>
      </div>

      {/* TRANSPORTATION INTEGRATION */}
      {!userExp.completed && (
        <div className="transportation-section">
          <h2>🚗 Get There</h2>

          {!showTransportOptions ? (
            <button
              onClick={() => setShowTransportOptions(true)}
              className="btn-primary btn-large"
            >
              Schedule Transportation
            </button>
          ) : (
            <div className="transport-options">
              <h3>Available Rides</h3>

              {/* Show estimated costs */}
              {rideCost && (
                <div className="cost-estimate">
                  <p>Estimated ride cost: ~{rideCost.totalCost.toFixed(2)} MON</p>
                  <p className="text-sm">
                    Total adventure cost: {formatMON(exp.price + rideCost.totalCost)}
                  </p>
                </div>
              )}

              {/* Request ride to experience */}
              <RideRequestForm
                destination={{
                  lat: gpsLat,
                  lon: gpsLon,
                  name: exp.locationName,
                  address: exp.addressHint
                }}
                estimatedCost={rideCost?.totalCost || 0}
              />
            </div>
          )}
        </div>
      )}

      {/* COMPLETION */}
      {!userExp.completed && (
        <div className="completion-section">
          <h2>✅ Complete Your Experience</h2>
          <p>When you arrive at the location, check in to earn your reward!</p>

          <CompletionCheckIn
            tokenId={tokenId}
            targetLat={gpsLat}
            targetLon={gpsLon}
            rewardAmount={exp.rewardAmount}
            completionRadius={exp.completionRadius}
          />
        </div>
      )}

      {/* Completion Proof */}
      {userExp.completed && userExp.completionProofHash && (
        <div className="completion-proof">
          <h2>🎉 Completion Memory</h2>
          <img src={`https://ipfs.io/ipfs/${userExp.completionProofHash}`} alt="Completion proof" />

          <button
            onClick={() => shareToFarcaster(
              `Just completed ${exp.title} in ${exp.locationName}! 🎉\n` +
              `Earned ${formatMON(exp.rewardAmount)} on @empowertours`
            )}
            className="btn-primary"
          >
            📱 Share on Farcaster
          </button>
        </div>
      )}
    </div>
  );
}
```

### Component 3: GPS Check-In (Completion)

```typescript
// components/CompletionCheckIn.tsx

'use client';

import { useState, useEffect } from 'react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { calculateDistance } from '@/utils/distance';

export function CompletionCheckIn({
  tokenId,
  targetLat,
  targetLon,
  rewardAmount,
  completionRadius
}: {
  tokenId: number;
  targetLat: number;
  targetLon: number;
  rewardAmount: number;
  completionRadius: number;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploadedHash, setUploadedHash] = useState<string>('');

  const { location, loading, error, requestLocation } = useGeolocation();

  const distance = location
    ? calculateDistance(location.latitude, location.longitude, targetLat, targetLon) * 1000 // meters
    : null;

  const withinRange = distance !== null && distance <= completionRadius;

  const handleCheckIn = async () => {
    if (!location || !withinRange) {
      alert('You must be at the location to check in!');
      return;
    }

    if (!photo) {
      alert('Please take a photo for completion proof!');
      return;
    }

    setIsChecking(true);

    try {
      // 1. Upload photo to IPFS
      const formData = new FormData();
      formData.append('file', photo);

      const uploadRes = await fetch('/api/upload-ipfs', {
        method: 'POST',
        body: formData
      });

      const { ipfsHash } = await uploadRes.json();
      setUploadedHash(ipfsHash);

      // 2. Complete experience on-chain
      const response = await fetch('/api/complete-experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          userLat: Math.floor(location.latitude * 1e6),
          userLon: Math.floor(location.longitude * 1e6),
          proofHash: ipfsHash
        })
      });

      if (!response.ok) throw new Error('Check-in failed');

      alert(`🎉 Experience completed! You earned ${formatMON(rewardAmount)}!`);

      // Redirect to experience detail to show completion
      window.location.reload();

    } catch (err) {
      console.error(err);
      alert('Check-in failed. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="check-in-form">
      <h3>GPS Check-In</h3>

      {/* Current location status */}
      <div className="location-status">
        {loading && <p>📍 Getting your location...</p>}
        {error && <p className="error">❌ Location permission denied</p>}
        {location && distance !== null && (
          <div className={withinRange ? 'status-success' : 'status-warning'}>
            <p>
              {withinRange
                ? `✅ You're here! (${distance.toFixed(0)}m away)`
                : `⚠️ You're ${distance.toFixed(0)}m away. Get within ${completionRadius}m to check in.`
              }
            </p>
          </div>
        )}
      </div>

      {!location && (
        <button onClick={requestLocation} className="btn-secondary">
          📍 Enable Location
        </button>
      )}

      {/* Photo upload */}
      {location && (
        <div className="photo-upload">
          <h4>Take a Photo</h4>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
          {photo && (
            <div className="photo-preview">
              <img src={URL.createObjectURL(photo)} alt="Completion proof" />
            </div>
          )}
        </div>
      )}

      {/* Check in button */}
      <button
        onClick={handleCheckIn}
        disabled={!withinRange || !photo || isChecking}
        className="btn-primary btn-large"
      >
        {isChecking ? '⏳ Checking In...' : `✅ Check In & Earn ${formatMON(rewardAmount)}`}
      </button>

      {/* Info */}
      <div className="info-box">
        <p className="text-sm">
          📍 You must be within {completionRadius}m of the location<br />
          📸 Photo proof required<br />
          🎁 Instant reward upon completion
        </p>
      </div>
    </div>
  );
}
```

---

## Phase 3: Service Marketplace Integration (Week 5)

### Ride Request to Experience

```typescript
// components/RideRequestForm.tsx

export function RideRequestForm({
  destination,
  estimatedCost
}: {
  destination: {
    lat: number;
    lon: number;
    name: string;
    address: string;
  };
  estimatedCost: number;
}) {
  const [pickupLocation, setPickupLocation] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [vehicleType, setVehicleType] = useState('CAR');

  const handleRequestRide = async () => {
    const response = await fetch('/api/execute-delegated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: effectiveAddress,
        action: 'create_ride_request',
        params: {
          pickupLocation,
          destination: `${destination.lat},${destination.lon}`,
          agreedPrice: parseEther(estimatedCost.toString()),
          capacity
        }
      })
    });

    const { requestId } = await response.json();

    alert(`🚗 Ride requested! Request ID: ${requestId}`);

    // Redirect to ride tracking page
    router.push(`/rides/${requestId}`);
  };

  return (
    <div className="ride-request-form">
      <h4>Request Ride to {destination.name}</h4>

      <input
        placeholder="Your Current Location"
        value={pickupLocation}
        onChange={(e) => setPickupLocation(e.target.value)}
      />

      <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
        <option value="CAR">🚗 Car</option>
        <option value="MOTORCYCLE">🏍️ Motorcycle</option>
        <option value="SCOOTER">🛵 Scooter</option>
      </select>

      <input
        type="number"
        placeholder="Passengers"
        value={capacity}
        onChange={(e) => setCapacity(parseInt(e.target.value))}
      />

      <div className="cost-summary">
        <p>Estimated Cost: ~{estimatedCost.toFixed(2)} MON</p>
      </div>

      <button onClick={handleRequestRide} className="btn-primary">
        🚗 Request Ride
      </button>
    </div>
  );
}
```

---

## Phase 4: Testing & Polish (Week 6)

### Test Scenarios

1. **End-to-End Flow:**
   - [ ] Browse experiences
   - [ ] Mint experience (GPS reveals)
   - [ ] Request ride to location
   - [ ] Driver accepts and picks up
   - [ ] Arrive at location
   - [ ] GPS check-in within radius
   - [ ] Upload photo proof
   - [ ] Receive completion reward
   - [ ] Share on Farcaster

2. **Edge Cases:**
   - [ ] Check-in outside radius (should fail)
   - [ ] Check-in without photo (should fail)
   - [ ] Multiple completion attempts (should fail)
   - [ ] Ride cancellation flow
   - [ ] GPS permission denied handling

3. **Security:**
   - [ ] Can't complete without being at location
   - [ ] Can't complete twice
   - [ ] Payment splits correct
   - [ ] Rewards distribute properly

---

## Deployment Checklist

- [ ] Deploy ExperienceNFT contract to testnet
- [ ] Fund contract with reward WMON
- [ ] Create 5-10 test experiences (Accra, Lagos, Nairobi)
- [ ] Integrate with ServiceMarketplace for rides
- [ ] Build frontend components
- [ ] Add map integration (Google Maps or Mapbox)
- [ ] Implement IPFS upload for photos
- [ ] Test GPS check-in logic
- [ ] Test reward distribution
- [ ] Deploy to production

---

## Success Metrics

**KPIs to Track:**
- Experiences minted per week
- Completion rate (% of minted experiences completed)
- Average time from mint to completion
- Rides booked via experience integration
- User satisfaction (ratings)
- Reward claims
- Social shares to Farcaster

**Target Goals (Month 1):**
- 50 experiences minted
- 30% completion rate
- 20 rides booked via experiences
- 15 Farcaster shares

---

## Next Steps After Launch

1. **Creator Tools:**
   - Dashboard for tour operators
   - Analytics (mints, completions, revenue)
   - Batch experience creation

2. **Enhanced Features:**
   - Multi-location experiences (treasure hunt style)
   - Group experiences (book for multiple people)
   - Seasonal/limited experiences
   - Dynamic pricing based on demand

3. **Gamification:**
   - Badges for completing X experiences
   - Leaderboards (most completed)
   - Streak bonuses

---

**This is THE killer feature! Once this is live, everything else falls into place!** 🚀

---

**Last Updated:** December 2025
**Status:** Ready to Build
**Priority:** 🔥 HIGHEST
