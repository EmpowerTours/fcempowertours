# Service Marketplace - Food Delivery & Ride Sharing

## 🎯 Overview

Decentralized marketplace for food delivery and ride-sharing services with:
- ✅ **Escrow payments** - Funds held until service completed
- ✅ **Real-time tracking** - Location updates stored on-chain (IPFS hashes)
- ✅ **Delegation support** - Gasless transactions via Platform Safe
- ✅ **Rating system** - Provider ratings out of 100
- ✅ **Dispute resolution** - Owner can resolve disputes fairly
- ✅ **No-show protection** - Drivers/delivery persons compensated for customer no-shows
- ✅ **Multi-service** - Both food delivery and rides in one contract

---

## 🏗️ Contract Architecture

### ServiceMarketplace.sol

**Key Features:**
1. **Beneficiary Pattern**: All functions support delegation (e.g., `createFoodOrderFor(beneficiary, ...)`)
2. **Escrow System**: Funds locked until completion
3. **Status Tracking**: Granular status updates with location hashes
4. **Platform Fee**: 5% default fee (adjustable)
5. **Dispute Management**: 24-hour window for raising disputes
6. **No-Show Protection**: 40% compensation to providers, 60% refund to customers after 5-minute wait

**Services Supported:**
- 🍕 **Food Delivery**: Menu creation, ordering, prep tracking, delivery
- 🚗 **Ride Sharing**: Vehicle registration, ride requests, real-time tracking

---

## 📦 Deployment

### Step 1: Deploy Contract

```bash
cd contracts

# Deploy ServiceMarketplace
forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz

# Save the deployed address!
```

**Constructor Args:**
- `_toursToken`: `0xa123600c82E69cB311B0e068B06Bfa9F787699B7`
- `_platformSafe`: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20`

### Step 2: Manual Verification (if needed)

```bash
# If auto-verify fails, verify manually
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  ServiceMarketplace \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --constructor-args $(cast abi-encode "constructor(address,address)" \
    0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)
```

### Step 3: Update Environment Variables

Add to `.env.local`:
```env
NEXT_PUBLIC_SERVICE_MARKETPLACE=0xDEPLOYED_ADDRESS_HERE
```

---

## 🍕 Food Delivery Flow

### For Food Providers (Sellers)

#### 1. Register as Provider
```solidity
registerFoodProvider(
  "Joe's Pizza",                    // businessName
  "Best pizza in town",             // description
  0xDELIVERY_PERSON_ADDRESS         // deliveryPerson
)
```

#### 2. Add Menu Items
```solidity
addMenuItem(
  "Margherita Pizza",               // name
  "Classic tomato & mozzarella",    // description
  25 ether,                         // price (25 TOURS)
  30,                               // prepTimeMinutes
  "ipfs://Qm..."                    // imageUrl
)
```

#### 3. Accept Orders
```solidity
acceptFoodOrder(orderId)
```

#### 4. Update Status as Food Progresses
```solidity
// Food is being prepared
updateFoodStatus(orderId, FoodStatus.PREPARING, "ipfs://location1")

// Food is ready for pickup
updateFoodStatus(orderId, FoodStatus.READY, "ipfs://location2")

// Delivery person picked up food
updateFoodStatus(orderId, FoodStatus.PICKED_UP, "ipfs://location3")

// In transit
updateFoodStatus(orderId, FoodStatus.DELIVERING, "ipfs://location4")

// Delivered
updateFoodStatus(orderId, FoodStatus.DELIVERED, "ipfs://location5")
```

### For Customers

#### 1. Browse Menus (via frontend/Envio)
Fetch active food providers and their menus

#### 2. Place Order (with delegation)
```typescript
// Via Platform Safe delegation
await fetch('/api/execute-delegated', {
  method: 'POST',
  body: JSON.stringify({
    userAddress: customer,
    action: 'create_food_order',
    params: {
      provider: '0xPROVIDER_ADDRESS',
      menuItemIds: [0, 1, 2],
      quantities: [1, 2, 1],
      deliveryAddress: "123 Main St, Apt 4B"
    }
  })
})
```

Funds are escrowed in contract.

#### 3. Track Order Status
Monitor events or query contract for location updates

#### 4. Confirm Delivery
```typescript
// Releases escrow to provider
await fetch('/api/execute-delegated', {
  method: 'POST',
  body: JSON.stringify({
    userAddress: customer,
    action: 'confirm_food_delivery',
    params: {
      orderId: 123,
      rating: 95  // Out of 100
    }
  })
})
```

Provider receives payment minus 5% platform fee.

---

## 🚗 Ride Sharing Flow

### For Drivers

#### 1. Register as Driver
```solidity
registerRideProvider(
  "John Doe",                       // driverName
  "Car",                            // vehicleType
  "Tesla Model 3",                  // model
  "ABC-1234",                       // licensePlate
  4,                                // capacity
  "ipfs://Qm..."                    // vehicleImageUrl
)
```

#### 2. Accept Ride Requests
```solidity
acceptRideRequest(
  requestId,
  30  // estimatedDuration in minutes
)
```

#### 3. Update Location Throughout Ride
```solidity
// Heading to pickup
updateRideStatus(requestId, RideStatus.ARRIVING, "ipfs://location1")

// Picked up passenger
updateRideStatus(requestId, RideStatus.PICKED_UP, "ipfs://location2")

// In transit
updateRideStatus(requestId, RideStatus.IN_TRANSIT, "ipfs://location3")

// Arrived at destination
updateRideStatus(requestId, RideStatus.ARRIVED, "ipfs://location4")
```

### For Passengers

#### 1. Request Ride (with delegation)
```typescript
await fetch('/api/execute-delegated', {
  method: 'POST',
  body: JSON.stringify({
    userAddress: passenger,
    action: 'create_ride_request',
    params: {
      pickupLocation: "123 Main St",
      destination: "456 Oak Ave",
      agreedPrice: "50000000000000000000", // 50 TOURS
      capacity: 2
    }
  })
})
```

Funds are escrowed in contract.

#### 2. Track Driver Location
Monitor events or query contract for driver's real-time location

#### 3. Confirm Ride Completion
```typescript
await fetch('/api/execute-delegated', {
  method: 'POST',
  body: JSON.stringify({
    userAddress: passenger,
    action: 'confirm_ride_completion',
    params: {
      requestId: 456,
      rating: 88
    }
  })
})
```

Driver receives payment minus 5% platform fee.

---

## 🔒 Escrow & Payment Flow

### How Escrow Works:

1. **Order/Request Created**:
   - Customer's TOURS transferred to contract
   - Funds held in escrow

2. **Service In Progress**:
   - Funds locked in contract
   - No one can access them

3. **Completion**:
   - Customer confirms delivery/arrival
   - Contract calculates: `providerAmount = escrowAmount - (escrowAmount * 5 / 100)`
   - Sends provider their share
   - Sends 5% platform fee to Platform Safe

4. **Dispute**:
   - Customer can raise dispute within 24 hours
   - Owner reviews and resolves
   - Can issue partial or full refunds

### Example Payment:

**Food Order: 100 TOURS**
- Escrow: 100 TOURS
- Platform Fee (5%): 5 TOURS
- Provider Receives: 95 TOURS

---

## 📍 Location Tracking

### How It Works:

1. **Off-Chain GPS**: Mobile app tracks real-time GPS location
2. **IPFS Storage**: Location data uploaded to IPFS
3. **On-Chain Hash**: IPFS hash stored in contract via `updateFoodStatus()` or `updateRideStatus()`
4. **Frontend Display**: Fetch IPFS data and display on map

### Example Location Update:

```typescript
// Mobile app (delivery person or driver)
const locationData = {
  latitude: 40.7128,
  longitude: -74.0060,
  timestamp: Date.now(),
  speed: 15, // km/h
  heading: 180
};

// Upload to IPFS
const ipfsHash = await uploadToIPFS(locationData);

// Update contract
await updateFoodStatus(orderId, FoodStatus.DELIVERING, ipfsHash);
```

### Frontend Display:

```typescript
// Fetch current location from contract
const order = await marketplace.getFoodOrder(orderId);
const locationHash = order.locationHash;

// Fetch from IPFS
const locationData = await fetchFromIPFS(locationHash);

// Display on map
displayOnMap(locationData.latitude, locationData.longitude);
```

---

## 🚨 Dispute Resolution

### Customer Raises Dispute:

```typescript
// Must be within 24 hours of order creation
await marketplace.raiseFoodDispute(orderId);
// or
await marketplace.raiseRideDispute(requestId);
```

### Owner Resolves Dispute:

```solidity
// Full refund to customer
resolveFoodDispute(orderId, true, 100);

// 50% refund to customer, 50% to provider
resolveFoodDispute(orderId, true, 50);

// No refund, provider keeps all
resolveFoodDispute(orderId, false, 0);
```

---

## 🚫 No-Show Protection

### Overview

Protects delivery persons and drivers from customer no-shows by providing compensation for gas and time spent.

**How It Works:**
1. Delivery person/driver arrives at customer location
2. Updates status to `DELIVERED` or `ARRIVED` (arrival timestamp recorded automatically)
3. If customer doesn't show up within **5 minutes**, provider can claim compensation
4. Provider submits **photo proof** (IPFS hash) of location or food placement
5. Contract releases **40% compensation** to provider, **60% refund** to customer

### For Food Delivery

#### Delivery Person Claims No-Show Compensation

```solidity
// After waiting 5 minutes at customer location
claimFoodNoShowCompensation(
  orderId,
  "ipfs://Qm...photo_proof"  // Photo of location/food left
)
```

**Requirements:**
- Caller must be the assigned delivery person
- Order status must be `DELIVERED` (arrival recorded)
- At least 5 minutes must have elapsed since arrival
- Photo proof (IPFS hash) required
- Funds not already released

**Payment Breakdown:**
```
Example: 100 TOURS order

Delivery Person Compensation: 40 TOURS (40% - gas + time)
Customer Refund: 60 TOURS (60%)
```

**Contract Flow:**
```solidity
// 1. Delivery person arrives, updates status
updateFoodStatus(orderId, FoodStatus.DELIVERED, "ipfs://arrival_location");
// → arrivalTimestamp recorded automatically

// 2. Wait 5 minutes for customer

// 3. Customer doesn't show up, claim compensation
claimFoodNoShowCompensation(orderId, "ipfs://photo_of_food_left");

// 4. Order marked as NO_SHOW
// 5. 40 TOURS sent to delivery person
// 6. 60 TOURS refunded to customer
```

### For Ride Sharing

#### Driver Claims No-Show Compensation

```solidity
// After waiting 5 minutes at pickup location
claimRideNoShowCompensation(
  requestId,
  "ipfs://Qm...photo_proof"  // Photo of arrival location
)
```

**Requirements:**
- Caller must be the assigned driver
- Ride status must be `ARRIVED` (arrival recorded)
- At least 5 minutes must have elapsed since arrival
- Photo proof (IPFS hash) required
- Funds not already released

**Payment Breakdown:**
```
Example: 50 TOURS ride

Driver Compensation: 20 TOURS (40% - gas + time)
Passenger Refund: 30 TOURS (60%)
```

**Contract Flow:**
```solidity
// 1. Driver arrives at pickup, updates status
updateRideStatus(requestId, RideStatus.ARRIVED, "ipfs://pickup_location");
// → arrivalTimestamp recorded automatically

// 2. Wait 5 minutes for passenger

// 3. Passenger doesn't show up, claim compensation
claimRideNoShowCompensation(requestId, "ipfs://photo_of_location");

// 4. Ride marked as NO_SHOW
// 5. 20 TOURS sent to driver
// 6. 30 TOURS refunded to passenger
```

### Photo Proof Guidelines

**What to Include:**
- **Food Delivery**: Photo showing address/building where food was left
- **Ride Sharing**: Photo showing pickup location (street sign, building number, etc.)
- **Timestamp**: Include photo metadata with timestamp (IPFS stores this)
- **GPS Coordinates**: Embed in IPFS metadata if possible

**Example IPFS Upload:**
```typescript
const photoProof = {
  imageUrl: "data:image/jpeg;base64,...",
  timestamp: Date.now(),
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 10  // meters
  },
  notes: "Food left at apartment door as no one answered after 5 minutes"
};

const proofHash = await uploadToIPFS(photoProof);
// Returns: "ipfs://Qm..."
```

### Events

```solidity
event NoShowCompensationClaimed(
  ServiceType serviceType,  // FOOD_DELIVERY or RIDE_TRANSPORT
  uint256 indexed id,        // orderId or requestId
  address indexed claimer,   // delivery person or driver
  uint256 compensation,      // Amount paid to claimer
  string proofHash          // IPFS hash of photo proof
);
```

### Delegation API Cases

Add these cases for delegation support:

```typescript
// ==================== CLAIM FOOD NO-SHOW COMPENSATION ====================
case 'claim_food_no_show':
  console.log('🚫 Action: claim_food_no_show');

  if (!params?.orderId || !params?.proofPhotoHash) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const claimFoodCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function claimFoodNoShowCompensation(uint256 orderId, string proofPhotoHash) external'
        ]),
        functionName: 'claimFoodNoShowCompensation',
        args: [
          BigInt(params.orderId),
          params.proofPhotoHash
        ],
      }) as Hex,
    },
  ];

  const claimFoodTxHash = await executeTransaction(claimFoodCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: claimFoodTxHash,
    action,
    userAddress,
    message: 'No-show compensation claimed!',
  });

// ==================== CLAIM RIDE NO-SHOW COMPENSATION ====================
case 'claim_ride_no_show':
  console.log('🚫 Action: claim_ride_no_show');

  if (!params?.requestId || !params?.proofPhotoHash) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const claimRideCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function claimRideNoShowCompensation(uint256 requestId, string proofPhotoHash) external'
        ]),
        functionName: 'claimRideNoShowCompensation',
        args: [
          BigInt(params.requestId),
          params.proofPhotoHash
        ],
      }) as Hex,
    },
  ];

  const claimRideTxHash = await executeTransaction(claimRideCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: claimRideTxHash,
    action,
    userAddress,
    message: 'No-show compensation claimed!',
  });
```

### Frontend Flow

**Mobile App - Delivery Person/Driver View:**

```typescript
// After arriving at location
const arrivalTime = Date.now();

// Update status to DELIVERED/ARRIVED
await updateStatus(orderId, 'DELIVERED', arrivalLocationHash);

// Start 5-minute timer
const waitTimer = setTimeout(async () => {
  // Show "Claim No-Show Compensation" button
  setShowNoShowButton(true);
}, 5 * 60 * 1000); // 5 minutes

// If customer shows up before timer, cancel
const onCustomerArrived = () => {
  clearTimeout(waitTimer);
  // Continue with normal delivery confirmation
};

// If timer expires and customer doesn't show
const onClaimNoShow = async () => {
  // 1. Take photo proof
  const photo = await takePhoto();

  // 2. Upload to IPFS
  const proofHash = await uploadToIPFS({
    image: photo,
    timestamp: Date.now(),
    location: await getCurrentLocation(),
    notes: "Customer did not show up after 5 minutes"
  });

  // 3. Claim compensation via delegation
  await fetch('/api/execute-delegated', {
    method: 'POST',
    body: JSON.stringify({
      userAddress: deliveryPersonAddress,
      action: 'claim_food_no_show',
      params: {
        orderId,
        proofPhotoHash: proofHash
      }
    })
  });

  // 4. Show success message with compensation amount
  showMessage(`Compensation claimed: ${compensationAmount} TOURS`);
};
```

---

## 🔗 Delegation API Integration

Add these cases to `app/api/execute-delegated/route.ts`:

### Food Delivery Cases

```typescript
// ==================== CREATE FOOD ORDER ====================
case 'create_food_order':
  console.log('🍕 Action: create_food_order');

  if (!params?.provider || !params?.menuItemIds || !params?.quantities) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const SERVICE_MARKETPLACE = process.env.NEXT_PUBLIC_SERVICE_MARKETPLACE as Address;

  const createOrderCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function createFoodOrderFor(address beneficiary, address provider, uint256[] menuItemIds, uint256[] quantities, string deliveryAddress) external returns (uint256)'
        ]),
        functionName: 'createFoodOrderFor',
        args: [
          userAddress as Address,
          params.provider as Address,
          params.menuItemIds.map((id: any) => BigInt(id)),
          params.quantities.map((q: any) => BigInt(q)),
          params.deliveryAddress || ''
        ],
      }) as Hex,
    },
  ];

  const createOrderTxHash = await executeTransaction(createOrderCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: createOrderTxHash,
    action,
    userAddress,
    message: 'Food order created!',
  });

// ==================== CONFIRM FOOD DELIVERY ====================
case 'confirm_food_delivery':
  console.log('✅ Action: confirm_food_delivery');

  if (!params?.orderId || !params?.rating) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const confirmFoodCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function confirmFoodDeliveryFor(address beneficiary, uint256 orderId, uint256 rating) external'
        ]),
        functionName: 'confirmFoodDeliveryFor',
        args: [
          userAddress as Address,
          BigInt(params.orderId),
          BigInt(params.rating)
        ],
      }) as Hex,
    },
  ];

  const confirmFoodTxHash = await executeTransaction(confirmFoodCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: confirmFoodTxHash,
    action,
    userAddress,
    message: 'Food delivery confirmed!',
  });
```

### Ride Sharing Cases

```typescript
// ==================== CREATE RIDE REQUEST ====================
case 'create_ride_request':
  console.log('🚗 Action: create_ride_request');

  if (!params?.pickupLocation || !params?.destination || !params?.agreedPrice) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const createRideCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function createRideRequestFor(address beneficiary, string pickupLocation, string destination, uint256 agreedPrice, uint256 capacity) external returns (uint256)'
        ]),
        functionName: 'createRideRequestFor',
        args: [
          userAddress as Address,
          params.pickupLocation,
          params.destination,
          BigInt(params.agreedPrice),
          BigInt(params.capacity || 1)
        ],
      }) as Hex,
    },
  ];

  const createRideTxHash = await executeTransaction(createRideCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: createRideTxHash,
    action,
    userAddress,
    message: 'Ride request created!',
  });

// ==================== CONFIRM RIDE COMPLETION ====================
case 'confirm_ride_completion':
  console.log('✅ Action: confirm_ride_completion');

  if (!params?.requestId || !params?.rating) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const confirmRideCalls = [
    {
      to: SERVICE_MARKETPLACE,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function confirmRideCompletionFor(address beneficiary, uint256 requestId, uint256 rating) external'
        ]),
        functionName: 'confirmRideCompletionFor',
        args: [
          userAddress as Address,
          BigInt(params.requestId),
          BigInt(params.rating)
        ],
      }) as Hex,
    },
  ];

  const confirmRideTxHash = await executeTransaction(confirmRideCalls, userAddress as Address, 0n);
  await incrementTransactionCount(userAddress);

  return NextResponse.json({
    success: true,
    txHash: confirmRideTxHash,
    action,
    userAddress,
    message: 'Ride completion confirmed!',
  });
```

---

## 📊 Contract Events

### Food Delivery Events

```solidity
event FoodProviderRegistered(address indexed provider, string businessName);
event MenuItemAdded(address indexed provider, uint256 itemId, string name, uint256 price);
event FoodOrderCreated(uint256 indexed orderId, address indexed customer, address indexed provider, uint256 totalAmount);
event FoodOrderStatusUpdated(uint256 indexed orderId, FoodStatus status, string locationHash);
event FoodOrderCompleted(uint256 indexed orderId, address indexed provider, uint256 amount);
```

### Ride Sharing Events

```solidity
event RideProviderRegistered(address indexed driver, string driverName);
event RideRequestCreated(uint256 indexed requestId, address indexed passenger, uint256 agreedPrice);
event RideRequestAccepted(uint256 indexed requestId, address indexed driver);
event RideStatusUpdated(uint256 indexed requestId, RideStatus status, string locationHash);
event RideCompleted(uint256 indexed requestId, address indexed driver, uint256 amount);
```

### General Events

```solidity
event DisputeRaised(ServiceType serviceType, uint256 indexed id, address indexed raiser);
event RatingSubmitted(address indexed provider, uint256 rating, address indexed rater);
event NoShowCompensationClaimed(ServiceType serviceType, uint256 indexed id, address indexed claimer, uint256 compensation, string proofHash);
```

---

## 🧪 Testing Checklist

### Food Delivery Testing

- [ ] Register food provider with delivery person
- [ ] Add menu items (3-5 items)
- [ ] Customer creates order (via delegation)
- [ ] Verify escrow funds locked
- [ ] Provider accepts order
- [ ] Update status through all stages (PREPARING → READY → PICKED_UP → DELIVERING → DELIVERED)
- [ ] Verify location hashes stored correctly
- [ ] Customer confirms delivery with rating
- [ ] Verify provider received payment (95 TOURS for 100 TOURS order)
- [ ] Verify platform fee sent to Platform Safe (5 TOURS)
- [ ] Verify provider rating updated

### Ride Sharing Testing

- [ ] Register ride provider with vehicle info
- [ ] Customer creates ride request (via delegation)
- [ ] Verify escrow funds locked
- [ ] Driver accepts request with ETA
- [ ] Update status through all stages (ARRIVING → PICKED_UP → IN_TRANSIT → ARRIVED)
- [ ] Verify location hashes stored correctly
- [ ] Customer confirms completion with rating
- [ ] Verify driver received payment
- [ ] Verify platform fee sent
- [ ] Verify driver rating updated

### Dispute Testing

- [ ] Raise food delivery dispute
- [ ] Resolve with full refund
- [ ] Resolve with partial refund
- [ ] Resolve with no refund
- [ ] Verify dispute window enforcement (24 hours)

### No-Show Protection Testing

#### Food Delivery No-Show
- [ ] Delivery person updates status to DELIVERED at customer location
- [ ] Verify arrivalTimestamp recorded automatically
- [ ] Attempt to claim compensation before 5 minutes (should fail)
- [ ] Wait 5 minutes after arrival
- [ ] Upload photo proof to IPFS
- [ ] Claim no-show compensation with proof hash
- [ ] Verify order status changed to NO_SHOW
- [ ] Verify delivery person received 40% compensation
- [ ] Verify customer received 60% refund
- [ ] Verify NoShowCompensationClaimed event emitted
- [ ] Verify funds fully distributed (no funds stuck in contract)

#### Ride Sharing No-Show
- [ ] Driver updates status to ARRIVED at pickup location
- [ ] Verify arrivalTimestamp recorded automatically
- [ ] Attempt to claim compensation before 5 minutes (should fail)
- [ ] Wait 5 minutes after arrival
- [ ] Upload photo proof to IPFS
- [ ] Claim no-show compensation with proof hash
- [ ] Verify ride status changed to NO_SHOW
- [ ] Verify driver received 40% compensation
- [ ] Verify passenger received 60% refund
- [ ] Verify NoShowCompensationClaimed event emitted
- [ ] Verify funds fully distributed (no funds stuck in contract)

---

## 🚀 Quick Deploy Script

```bash
#!/bin/bash

echo "🚀 Deploying Service Marketplace..."

cd contracts

# Deploy
forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz

echo "✅ Deployment complete!"
echo "📝 Update NEXT_PUBLIC_SERVICE_MARKETPLACE in .env.local"
echo "🔗 Add delegation cases to execute-delegated API"
echo "🎨 Build frontend components for food & rides"
```

---

## 📱 Mobile App Requirements

### For Location Tracking:

1. **GPS Permission**: Request location access
2. **Background Location**: Allow tracking when app backgrounded
3. **IPFS Upload**: Regular location uploads every 30-60 seconds
4. **Contract Updates**: Call `updateFoodStatus()` or `updateRideStatus()` with new IPFS hash

### Recommended Libraries:

- **React Native**: `react-native-geolocation-service`
- **IPFS**: `ipfs-http-client` or Pinata API
- **Maps**: `react-native-maps`

---

## 🎯 Summary

### What Was Created:
1. ✅ **ServiceMarketplace.sol** - Main contract with escrow, tracking, delegation, and no-show protection
2. ✅ **DeployServiceMarketplace.s.sol** - Foundry deployment script
3. ✅ **Complete documentation** - This guide with no-show protection flow

### What's Needed Next:
1. Deploy contract to Monad testnet
2. Verify on MonadScan using Sourcify
3. Add delegation cases to API
4. Build frontend for food ordering and ride booking
5. Implement mobile location tracking
6. Test end-to-end flows

### Benefits:
- **No Uber fees** in underserved markets
- **Direct payments** to service providers
- **Transparent** escrow system
- **Decentralized** - no single point of control
- **Gasless** for users via delegation
- **Fair compensation** - Drivers/delivery persons protected from no-shows

Ready to deploy! 🚀
