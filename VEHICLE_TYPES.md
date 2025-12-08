# Vehicle Types - Service Marketplace

## 🚗🏍️🚲 Supported Vehicle Types

The Service Marketplace supports **ALL vehicle types** for both ride sharing and food delivery:

### Vehicle Options

| Vehicle Type | Typical Capacity | Ride Sharing | Food Delivery |
|-------------|------------------|--------------|---------------|
| 🏍️ **Motorcycle** | 1-2 passengers | ✅ Yes | ✅ Yes |
| 🛵 **Scooter** | 1-2 passengers | ✅ Yes | ✅ Yes |
| 🚲 **Bicycle** | 1 passenger | ✅ Yes | ✅ Yes |
| 🚗 **Car** | 4-6 passengers | ✅ Yes | ✅ Yes |
| 🚙 **Four-Wheeler/SUV** | 6-8 passengers | ✅ Yes | ✅ Yes |

---

## 📋 Registration Examples

### Example 1: Motorcycle Driver

```solidity
registerRideProvider(
  "John Doe",              // driverName
  "Motorcycle",            // vehicleType
  "Honda CBR 600",         // model
  "ABC-1234",              // licensePlate
  2,                       // capacity (can carry 1 passenger + driver)
  "ipfs://Qm..."           // vehicleImageUrl
)
```

**Can Do:**
- ✅ Accept ride requests for 1-2 passengers
- ✅ Deliver food orders (any size)

---

### Example 2: Bicycle Delivery Person

```solidity
registerRideProvider(
  "Jane Smith",            // driverName
  "Bicycle",               // vehicleType
  "Trek Mountain Bike",    // model
  "N/A",                   // licensePlate (optional for bicycles)
  1,                       // capacity (just rider, no passengers)
  "ipfs://Qm..."           // vehicleImageUrl
)
```

**Can Do:**
- ✅ Deliver food orders (perfect for local deliveries)
- ❌ Cannot accept ride requests (capacity 1 means solo only)

---

### Example 3: Car Driver (Multi-Purpose)

```solidity
registerRideProvider(
  "Mike Johnson",          // driverName
  "Car",                   // vehicleType
  "Toyota Camry 2020",     // model
  "XYZ-5678",              // licensePlate
  4,                       // capacity (can carry 4 passengers)
  "ipfs://Qm..."           // vehicleImageUrl
)
```

**Can Do:**
- ✅ Accept ride requests for 1-4 passengers
- ✅ Deliver food orders

---

### Example 4: Scooter (Urban Delivery)

```solidity
registerRideProvider(
  "Sarah Lee",             // driverName
  "Scooter",               // vehicleType
  "Vespa Sprint 150",      // model
  "DEF-9012",              // licensePlate
  2,                       // capacity
  "ipfs://Qm..."           // vehicleImageUrl
)
```

**Can Do:**
- ✅ Accept ride requests for 1-2 passengers
- ✅ Deliver food orders (great for city navigation)

---

## 🎯 How It Works

### For Food Delivery

**ANY** registered driver with **ANY** vehicle type can deliver food!

1. Restaurant marks food as **READY**
2. **ANY** driver (motorcycle, bicycle, car, scooter, etc.) sees the order
3. Driver calls `acceptDelivery(orderId)`
4. Driver delivers food
5. Driver earns **deliveryFee - 3% platform fee**

**Why this works:**
- Bicycles are great for local/city deliveries
- Motorcycles navigate traffic easily
- Cars can handle larger orders or longer distances
- Scooters are perfect for urban areas

---

### For Ride Sharing

**Capacity matching** is enforced for rides:

1. Passenger requests ride for **2 people**
2. Only drivers with **capacity ≥ 2** can accept:
   - ✅ Motorcycle (capacity 2)
   - ✅ Car (capacity 4+)
   - ✅ Scooter (capacity 2)
   - ❌ Bicycle (capacity 1) - **cannot accept**

**Why this works:**
- Motorcycles perfect for solo riders or couples
- Cars handle families and groups
- System automatically matches capacity needs

---

## 💰 Earnings

All drivers earn the same way regardless of vehicle type:

### Food Delivery
```
Driver receives: deliveryFee - 3%
Example: 20 TOURS fee → Driver gets 19.4 TOURS
```

### Ride Sharing
```
Driver receives: agreedPrice - 3%
Example: 50 TOURS ride → Driver gets 48.5 TOURS
```

---

## 🌍 Perfect for Underserved Markets

This flexible system works great where:
- Uber/Lyft don't operate
- Cars are expensive
- Motorcycles/scooters are common transport
- Bicycle deliveries are practical
- Mixed vehicle types are the norm

**Example: Southeast Asia, Latin America, Africa, etc.**

---

## 🔧 Frontend Integration

When displaying available drivers for food delivery:

```typescript
// Show ALL drivers (any vehicle type)
const allDrivers = await contract.getActiveRideProviders();

// Display vehicle type to customer
drivers.forEach(driver => {
  const { vehicleType, model } = driver.vehicle;
  console.log(`Driver available: ${vehicleType} (${model})`);
  // Shows: "Motorcycle (Honda CBR 600)" or "Bicycle (Trek Mountain)"
});
```

When matching rides:

```typescript
// Only show drivers with enough capacity
const rideRequest = { capacity: 3 };  // Need 3 seats

const matchingDrivers = allDrivers.filter(driver =>
  driver.vehicle.capacity >= rideRequest.capacity
);
// Only shows: Cars (capacity 4+), SUVs (capacity 6+)
// Excludes: Motorcycles (2), Bicycles (1), Scooters (2)
```

---

## ✅ Summary

- **Food Delivery**: Open to ALL vehicle types (no restrictions)
- **Ride Sharing**: Capacity-based matching (motorcycles OK for 1-2 passengers)
- **Same 3% Fee**: Fair pricing regardless of vehicle
- **Flexible System**: Perfect for global markets with diverse transport options
- **Driver Freedom**: Register once, do both rides and deliveries

🚀 Ready to deploy!
