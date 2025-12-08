// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPersonalAssistant {
    function isAssistantVerified(address assistant) external view returns (bool);
    function getAssistantTier(address assistant) external view returns (uint8);
    function getPlatformFeeForAssistant(address assistant) external view returns (uint256);
}

/**
 * @title ServiceMarketplace
 * @notice Personal concierge marketplace integrated with verification system
 * @dev Only verified assistants from PersonalAssistantV1 can register as providers
 * @dev Supports delegation via beneficiary pattern for gasless transactions
 *
 * ========================================================================
 * RECOMMENDED PRICING GUIDELINES (see TOKENOMICS_MODEL.md)
 * ========================================================================
 *
 * PRICING PHILOSOPHY (USD-Denominated, Paid in WMON):
 * - All prices set in USD value (e.g., $3 delivery fee)
 * - Paid in WMON at current market rate
 * - Frontend calculates: WMON_Amount = USD_Price / MON_USD_Price
 * - Example: $3 delivery fee when MON = $2.50 → Pay 1.2 WMON
 * - Example: $3 delivery fee when MON = $0.50 → Pay 6 WMON
 *
 * SUGGESTED USD PRICING:
 * Food Delivery Fees (USD):
 * - Short Range (< 3 miles):    $3 USD
 * - Medium Range (3-7 miles):   $5 USD
 * - Long Range (7-15 miles):    $8 USD
 *
 * Food Menu Items (USD):
 * - Fast Food:          $8-15 USD
 * - Casual Dining:      $15-40 USD
 * - Fine Dining:        $40-100+ USD
 *
 * Ride Sharing (USD):
 * Vehicle Type       | Base Fare | Per Mile | Per Minute | 3-mile Example
 * -------------------|-----------|----------|------------|---------------
 * Motorcycle/Scooter |  $2 USD   | $1 USD   |  $0.20 USD | ~$8-10 USD
 * Bicycle            |  $1 USD   | $0.75 USD|  $0.15 USD | ~$5-7 USD
 * Car                |  $3 USD   | $1.5 USD |  $0.30 USD | ~$12-15 USD
 * SUV/4-Wheeler      |  $4 USD   | $2 USD   |  $0.40 USD | ~$15-18 USD
 *
 * PLATFORM ECONOMICS:
 * - Platform Fee: 2-5% based on verification tier (vs 30% on Uber/DoorDash)
 * - Assistant Payout: 95-98% (vs 70% on competitors)
 * - Gasless transactions via delegation (platform pays gas)
 * - Prices denominated in USD, paid in WMON at market rate
 *
 * ========================================================================
 */
contract ServiceMarketplace is Ownable, ReentrancyGuard {

    // ========================================================================
    // ENUMS
    // ========================================================================

    enum ServiceType { FOOD_DELIVERY, RIDE_TRANSPORT }

    enum FoodStatus {
        PENDING,        // Order placed, awaiting acceptance
        ACCEPTED,       // Seller accepted, preparing food
        PREPARING,      // Food is being prepared
        READY,          // Food ready for pickup
        PICKED_UP,      // Delivery person picked up food
        DELIVERING,     // In transit to customer
        DELIVERED,      // Delivered to customer
        COMPLETED,      // Customer confirmed receipt
        CANCELLED,      // Order cancelled
        DISPUTED,       // Dispute raised
        NO_SHOW         // Customer no-show, delivery person compensated
    }

    enum RideStatus {
        PENDING,        // Ride requested, awaiting acceptance
        ACCEPTED,       // Driver accepted request
        ARRIVING,       // Driver en route to pickup
        PICKED_UP,      // Passenger picked up
        IN_TRANSIT,     // Heading to destination
        ARRIVED,        // Arrived at destination
        COMPLETED,      // Ride completed
        CANCELLED,      // Ride cancelled
        DISPUTED,       // Dispute raised
        NO_SHOW         // Passenger no-show, driver compensated
    }

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct MenuItem {
        uint256 id;
        string name;
        string description;
        uint256 price;          // in TOURS tokens
        uint256 prepTimeMinutes;
        bool available;
        string imageUrl;
    }

    struct FoodProvider {
        address providerAddress;
        string businessName;
        string description;
        MenuItem[] menu;
        bool isActive;
        uint256 totalOrders;
        uint256 rating;         // Out of 100
        uint256 ratingCount;
        uint256 registeredAt;
    }

    struct Vehicle {
        string vehicleType;     // Car, Motorcycle, Scooter, Bicycle, Four-Wheeler, etc.
        string model;
        string licensePlate;
        uint256 capacity;       // Number of passengers (for rides) / Can deliver food (any type)
        string imageUrl;
    }

    struct RideProvider {
        address driverAddress;
        string driverName;
        Vehicle vehicle;
        bool isActive;
        uint256 totalRides;
        uint256 rating;         // Out of 100
        uint256 ratingCount;
        uint256 registeredAt;
    }

    struct FoodOrder {
        uint256 orderId;
        address customer;
        address provider;
        address deliveryDriver;  // Driver who accepts the delivery (assigned when READY)
        uint256[] menuItemIds;
        uint256[] quantities;
        uint256 foodPrice;       // Price of food items
        uint256 deliveryFee;     // Fee for delivery service
        uint256 totalAmount;     // foodPrice + deliveryFee
        uint256 escrowAmount;
        FoodStatus status;
        string deliveryAddress;
        string locationHash;     // IPFS hash of current location
        uint256 createdAt;
        uint256 completedAt;
        uint256 arrivalTimestamp; // When delivery driver arrived at customer location
        bool fundsReleased;
    }

    struct RideRequest {
        uint256 requestId;
        address passenger;
        address driver;
        string pickupLocation;
        string destination;
        uint256 agreedPrice;
        uint256 escrowAmount;
        RideStatus status;
        string currentLocationHash; // IPFS hash of driver location
        uint256 estimatedDuration;  // in minutes
        uint256 capacity;           // number of passengers
        uint256 createdAt;
        uint256 completedAt;
        uint256 arrivalTimestamp;   // When driver arrived at destination
        bool fundsReleased;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    IERC20 public wmonToken;
    address public platformSafe;
    IPersonalAssistant public personalAssistantContract;

    mapping(address => FoodProvider) public foodProviders;
    mapping(address => RideProvider) public rideProviders;
    mapping(uint256 => FoodOrder) public foodOrders;
    mapping(uint256 => RideRequest) public rideRequests;

    mapping(uint256 => address) public orderToCustomer;
    mapping(uint256 => address) public requestToPassenger;

    address[] public activeFoodProviders;
    address[] public activeRideProviders;

    uint256 private _orderIdCounter;
    uint256 private _requestIdCounter;
    uint256 private _menuItemIdCounter;

    uint256 public platformFeePercent = 3; // 3% platform fee (much lower than Uber's 30%)
    uint256 public disputeTimeWindow = 24 hours;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event FoodProviderRegistered(address indexed provider, string businessName);
    event RideProviderRegistered(address indexed driver, string driverName);
    event MenuItemAdded(address indexed provider, uint256 itemId, string name, uint256 price);

    event FoodOrderCreated(uint256 indexed orderId, address indexed customer, address indexed provider, uint256 totalAmount);
    event DeliveryAccepted(uint256 indexed orderId, address indexed driver);
    event FoodOrderStatusUpdated(uint256 indexed orderId, FoodStatus status, string locationHash);
    event FoodOrderCompleted(uint256 indexed orderId, address indexed provider, uint256 providerAmount, address indexed driver, uint256 driverAmount);

    event RideRequestCreated(uint256 indexed requestId, address indexed passenger, uint256 agreedPrice);
    event RideRequestAccepted(uint256 indexed requestId, address indexed driver);
    event RideStatusUpdated(uint256 indexed requestId, RideStatus status, string locationHash);
    event RideCompleted(uint256 indexed requestId, address indexed driver, uint256 amount);

    event DisputeRaised(ServiceType serviceType, uint256 indexed id, address indexed raiser);
    event RatingSubmitted(address indexed provider, uint256 rating, address indexed rater);
    event NoShowCompensationClaimed(ServiceType serviceType, uint256 indexed id, address indexed claimer, uint256 compensation, string proofHash);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _wmonToken,
        address _platformSafe,
        address _personalAssistantContract
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_personalAssistantContract != address(0), "Invalid PersonalAssistant contract");
        wmonToken = IERC20(_wmonToken);
        platformSafe = _platformSafe;
        personalAssistantContract = IPersonalAssistant(_personalAssistantContract);
    }

    // ========================================================================
    // FOOD PROVIDER REGISTRATION
    // ========================================================================

    function registerFoodProvider(
        string memory businessName,
        string memory description
    ) external {
        require(bytes(businessName).length > 0, "Business name required");
        require(!foodProviders[msg.sender].isActive, "Already registered");
        require(personalAssistantContract.isAssistantVerified(msg.sender), "Must be verified assistant");

        FoodProvider storage provider = foodProviders[msg.sender];
        provider.providerAddress = msg.sender;
        provider.businessName = businessName;
        provider.description = description;
        provider.isActive = true;
        provider.registeredAt = block.timestamp;

        activeFoodProviders.push(msg.sender);

        emit FoodProviderRegistered(msg.sender, businessName);
    }

    function addMenuItem(
        string memory name,
        string memory description,
        uint256 price,
        uint256 prepTimeMinutes,
        string memory imageUrl
    ) external {
        require(foodProviders[msg.sender].isActive, "Not registered");
        require(price > 0, "Price must be > 0");

        uint256 itemId = _menuItemIdCounter++;

        MenuItem memory item = MenuItem({
            id: itemId,
            name: name,
            description: description,
            price: price,
            prepTimeMinutes: prepTimeMinutes,
            available: true,
            imageUrl: imageUrl
        });

        foodProviders[msg.sender].menu.push(item);

        emit MenuItemAdded(msg.sender, itemId, name, price);
    }

    function updateMenuItemAvailability(uint256 itemIndex, bool available) external {
        require(foodProviders[msg.sender].isActive, "Not registered");
        require(itemIndex < foodProviders[msg.sender].menu.length, "Invalid item");

        foodProviders[msg.sender].menu[itemIndex].available = available;
    }

    // ========================================================================
    // RIDE PROVIDER REGISTRATION
    // ========================================================================

    /**
     * @dev Register as a driver for rides AND food delivery
     * @notice Vehicle types: Car, Motorcycle, Scooter, Bicycle, Four-Wheeler, etc.
     *         Drivers can accept both ride requests and food delivery orders
     * @param vehicleType Type of vehicle (Car, Motorcycle, Scooter, Bicycle, Four-Wheeler, etc.)
     * @param capacity Number of passengers for ride sharing (1 for motorcycles, 4+ for cars)
     */
    function registerRideProvider(
        string memory driverName,
        string memory vehicleType,
        string memory model,
        string memory licensePlate,
        uint256 capacity,
        string memory vehicleImageUrl
    ) external {
        require(bytes(driverName).length > 0, "Driver name required");
        require(capacity > 0 && capacity <= 8, "Invalid capacity");
        require(!rideProviders[msg.sender].isActive, "Already registered");
        require(personalAssistantContract.isAssistantVerified(msg.sender), "Must be verified assistant");

        Vehicle memory vehicle = Vehicle({
            vehicleType: vehicleType,
            model: model,
            licensePlate: licensePlate,
            capacity: capacity,
            imageUrl: vehicleImageUrl
        });

        RideProvider storage provider = rideProviders[msg.sender];
        provider.driverAddress = msg.sender;
        provider.driverName = driverName;
        provider.vehicle = vehicle;
        provider.isActive = true;
        provider.registeredAt = block.timestamp;

        activeRideProviders.push(msg.sender);

        emit RideProviderRegistered(msg.sender, driverName);
    }

    // ========================================================================
    // FOOD ORDERING - WITH DELEGATION SUPPORT
    // ========================================================================

    /**
     * @dev Create food order on behalf of customer (delegation support)
     * @param beneficiary The customer ordering food
     * @param deliveryFee The fee customer is willing to pay for delivery
     */
    function createFoodOrderFor(
        address beneficiary,
        address provider,
        uint256[] memory menuItemIds,
        uint256[] memory quantities,
        string memory deliveryAddress,
        uint256 deliveryFee
    ) public nonReentrant returns (uint256) {
        require(foodProviders[provider].isActive, "Provider not active");
        require(menuItemIds.length == quantities.length, "Array length mismatch");
        require(menuItemIds.length > 0, "No items");
        require(deliveryFee > 0, "Delivery fee required");

        // Calculate food price
        uint256 foodPrice = 0;
        for (uint256 i = 0; i < menuItemIds.length; i++) {
            require(menuItemIds[i] < foodProviders[provider].menu.length, "Invalid menu item");
            MenuItem memory item = foodProviders[provider].menu[menuItemIds[i]];
            require(item.available, "Item not available");
            foodPrice += item.price * quantities[i];
        }

        uint256 totalAmount = foodPrice + deliveryFee;
        uint256 orderId = _orderIdCounter++;

        // Transfer total (food + delivery) to escrow
        require(
            wmonToken.transferFrom(beneficiary, address(this), totalAmount),
            "Transfer failed"
        );

        FoodOrder storage order = foodOrders[orderId];
        order.orderId = orderId;
        order.customer = beneficiary;
        order.provider = provider;
        order.deliveryDriver = address(0);  // Will be assigned when driver accepts
        order.menuItemIds = menuItemIds;
        order.quantities = quantities;
        order.foodPrice = foodPrice;
        order.deliveryFee = deliveryFee;
        order.totalAmount = totalAmount;
        order.escrowAmount = totalAmount;
        order.status = FoodStatus.PENDING;
        order.deliveryAddress = deliveryAddress;
        order.createdAt = block.timestamp;

        orderToCustomer[orderId] = beneficiary;

        emit FoodOrderCreated(orderId, beneficiary, provider, totalAmount);

        return orderId;
    }

    /**
     * @dev Legacy function - customer pays own gas
     */
    function createFoodOrder(
        address provider,
        uint256[] memory menuItemIds,
        uint256[] memory quantities,
        string memory deliveryAddress,
        uint256 deliveryFee
    ) external returns (uint256) {
        return createFoodOrderFor(msg.sender, provider, menuItemIds, quantities, deliveryAddress, deliveryFee);
    }

    /**
     * @dev Provider accepts order
     */
    function acceptFoodOrder(uint256 orderId) external {
        FoodOrder storage order = foodOrders[orderId];
        require(order.provider == msg.sender, "Not the provider");
        require(order.status == FoodStatus.PENDING, "Invalid status");

        order.status = FoodStatus.ACCEPTED;

        emit FoodOrderStatusUpdated(orderId, FoodStatus.ACCEPTED, "");
    }

    /**
     * @dev Driver accepts delivery when food is READY
     * @notice ANY registered driver can deliver food regardless of vehicle type
     *         (Car, Motorcycle, Scooter, Bicycle, Four-Wheeler, etc.)
     * @param orderId The food order ID
     */
    function acceptDelivery(uint256 orderId) external {
        require(rideProviders[msg.sender].isActive, "Not a registered driver");
        FoodOrder storage order = foodOrders[orderId];
        require(order.status == FoodStatus.READY, "Food not ready for pickup");
        require(order.deliveryDriver == address(0), "Delivery already accepted");

        order.deliveryDriver = msg.sender;
        order.status = FoodStatus.PICKED_UP;

        emit DeliveryAccepted(orderId, msg.sender);
        emit FoodOrderStatusUpdated(orderId, FoodStatus.PICKED_UP, "");
    }

    /**
     * @dev Update food preparation status with location
     */
    function updateFoodStatus(
        uint256 orderId,
        FoodStatus newStatus,
        string memory locationHash
    ) external {
        FoodOrder storage order = foodOrders[orderId];
        require(
            msg.sender == order.provider || msg.sender == order.deliveryDriver,
            "Not authorized"
        );
        require(order.status < FoodStatus.DELIVERED, "Order finalized");

        order.status = newStatus;
        order.locationHash = locationHash;

        // Track when delivery driver arrives at customer location
        if (newStatus == FoodStatus.DELIVERED) {
            order.arrivalTimestamp = block.timestamp;
        }

        emit FoodOrderStatusUpdated(orderId, newStatus, locationHash);
    }

    /**
     * @dev Customer confirms food delivery - releases escrow (3-way split)
     * Payment: Restaurant gets foodPrice - platform fee
     *          Driver gets deliveryFee - platform fee
     *          Platform gets total platform fee
     */
    function confirmFoodDeliveryFor(
        address beneficiary,
        uint256 orderId,
        uint256 rating
    ) public nonReentrant {
        FoodOrder storage order = foodOrders[orderId];
        require(order.customer == beneficiary, "Not the customer");
        require(order.status == FoodStatus.DELIVERED, "Not delivered yet");
        require(!order.fundsReleased, "Already released");
        require(rating <= 100, "Invalid rating");
        require(order.deliveryDriver != address(0), "No delivery driver assigned");

        order.status = FoodStatus.COMPLETED;
        order.completedAt = block.timestamp;
        order.fundsReleased = true;

        // Calculate platform fee from food and delivery separately
        uint256 foodPlatformFee = (order.foodPrice * platformFeePercent) / 100;
        uint256 deliveryPlatformFee = (order.deliveryFee * platformFeePercent) / 100;
        uint256 totalPlatformFee = foodPlatformFee + deliveryPlatformFee;

        uint256 providerAmount = order.foodPrice - foodPlatformFee;
        uint256 driverAmount = order.deliveryFee - deliveryPlatformFee;

        // Release funds - 3-way split
        require(wmonToken.transfer(order.provider, providerAmount), "Provider payment failed");
        require(wmonToken.transfer(order.deliveryDriver, driverAmount), "Driver payment failed");
        require(wmonToken.transfer(platformSafe, totalPlatformFee), "Platform fee transfer failed");

        // Update provider stats
        FoodProvider storage provider = foodProviders[order.provider];
        provider.totalOrders++;
        provider.rating = ((provider.rating * provider.ratingCount) + rating) / (provider.ratingCount + 1);
        provider.ratingCount++;

        // Update driver stats
        RideProvider storage driver = rideProviders[order.deliveryDriver];
        driver.totalRides++;  // Deliveries count toward driver stats
        driver.rating = ((driver.rating * driver.ratingCount) + rating) / (driver.ratingCount + 1);
        driver.ratingCount++;

        emit FoodOrderCompleted(orderId, order.provider, providerAmount, order.deliveryDriver, driverAmount);
        emit RatingSubmitted(order.provider, rating, beneficiary);
        emit RatingSubmitted(order.deliveryDriver, rating, beneficiary);
    }

    function confirmFoodDelivery(uint256 orderId, uint256 rating) external {
        confirmFoodDeliveryFor(msg.sender, orderId, rating);
    }

    /**
     * @dev Delivery driver claims no-show compensation after waiting 5 minutes
     * @param orderId The food order ID
     * @param proofPhotoHash IPFS hash of photo proof (location/food placement)
     */
    function claimFoodNoShowCompensation(
        uint256 orderId,
        string memory proofPhotoHash
    ) external nonReentrant {
        FoodOrder storage order = foodOrders[orderId];
        require(msg.sender == order.deliveryDriver, "Not the delivery driver");
        require(order.status == FoodStatus.DELIVERED, "Must be at delivery location");
        require(order.arrivalTimestamp > 0, "Arrival not recorded");
        require(block.timestamp >= order.arrivalTimestamp + 5 minutes, "Must wait 5 minutes");
        require(!order.fundsReleased, "Funds already released");
        require(bytes(proofPhotoHash).length > 0, "Photo proof required");

        // Calculate compensation: 40% to delivery driver for gas/time, 60% refund to customer
        uint256 compensation = (order.escrowAmount * 40) / 100;
        uint256 refund = order.escrowAmount - compensation;

        order.status = FoodStatus.NO_SHOW;
        order.completedAt = block.timestamp;
        order.fundsReleased = true;
        order.locationHash = proofPhotoHash; // Store photo proof

        // Pay delivery driver compensation for gas and time
        require(wmonToken.transfer(order.deliveryDriver, compensation), "Compensation transfer failed");

        // Refund customer
        require(wmonToken.transfer(order.customer, refund), "Refund transfer failed");

        emit NoShowCompensationClaimed(ServiceType.FOOD_DELIVERY, orderId, msg.sender, compensation, proofPhotoHash);
    }

    // ========================================================================
    // RIDE SERVICES - WITH DELEGATION SUPPORT
    // ========================================================================

    /**
     * @dev Create ride request on behalf of passenger (delegation support)
     */
    function createRideRequestFor(
        address beneficiary,
        string memory pickupLocation,
        string memory destination,
        uint256 agreedPrice,
        uint256 capacity
    ) public nonReentrant returns (uint256) {
        require(agreedPrice > 0, "Invalid price");
        require(capacity > 0, "Invalid capacity");

        uint256 requestId = _requestIdCounter++;

        // Transfer funds to escrow
        require(
            wmonToken.transferFrom(beneficiary, address(this), agreedPrice),
            "Transfer failed"
        );

        RideRequest storage request = rideRequests[requestId];
        request.requestId = requestId;
        request.passenger = beneficiary;
        request.pickupLocation = pickupLocation;
        request.destination = destination;
        request.agreedPrice = agreedPrice;
        request.escrowAmount = agreedPrice;
        request.status = RideStatus.PENDING;
        request.capacity = capacity;
        request.createdAt = block.timestamp;

        requestToPassenger[requestId] = beneficiary;

        emit RideRequestCreated(requestId, beneficiary, agreedPrice);

        return requestId;
    }

    function createRideRequest(
        string memory pickupLocation,
        string memory destination,
        uint256 agreedPrice,
        uint256 capacity
    ) external returns (uint256) {
        return createRideRequestFor(msg.sender, pickupLocation, destination, agreedPrice, capacity);
    }

    /**
     * @dev Driver accepts ride request
     * @notice Motorcycles (capacity 1-2), Cars (capacity 4+), etc.
     *         Driver's vehicle capacity must match or exceed request capacity
     * @param estimatedDuration Estimated time to complete ride in minutes
     */
    function acceptRideRequest(uint256 requestId, uint256 estimatedDuration) external {
        require(rideProviders[msg.sender].isActive, "Not registered driver");
        RideRequest storage request = rideRequests[requestId];
        require(request.status == RideStatus.PENDING, "Invalid status");
        require(rideProviders[msg.sender].vehicle.capacity >= request.capacity, "Insufficient capacity");

        request.driver = msg.sender;
        request.status = RideStatus.ACCEPTED;
        request.estimatedDuration = estimatedDuration;

        emit RideRequestAccepted(requestId, msg.sender);
    }

    /**
     * @dev Update ride status with current location
     */
    function updateRideStatus(
        uint256 requestId,
        RideStatus newStatus,
        string memory locationHash
    ) external {
        RideRequest storage request = rideRequests[requestId];
        require(request.driver == msg.sender, "Not the driver");
        require(request.status < RideStatus.ARRIVED, "Ride finalized");

        request.status = newStatus;
        request.currentLocationHash = locationHash;

        // Track when driver arrives at destination
        if (newStatus == RideStatus.ARRIVED) {
            request.arrivalTimestamp = block.timestamp;
        }

        emit RideStatusUpdated(requestId, newStatus, locationHash);
    }

    /**
     * @dev Passenger confirms ride completion - releases escrow
     */
    function confirmRideCompletionFor(
        address beneficiary,
        uint256 requestId,
        uint256 rating
    ) public nonReentrant {
        RideRequest storage request = rideRequests[requestId];
        require(request.passenger == beneficiary, "Not the passenger");
        require(request.status == RideStatus.ARRIVED, "Ride not completed");
        require(!request.fundsReleased, "Already released");
        require(rating <= 100, "Invalid rating");

        request.status = RideStatus.COMPLETED;
        request.completedAt = block.timestamp;
        request.fundsReleased = true;

        // Calculate platform fee
        uint256 platformFee = (request.escrowAmount * platformFeePercent) / 100;
        uint256 driverAmount = request.escrowAmount - platformFee;

        // Release funds
        require(wmonToken.transfer(request.driver, driverAmount), "Driver payment failed");
        require(wmonToken.transfer(platformSafe, platformFee), "Fee transfer failed");

        // Update driver stats
        RideProvider storage provider = rideProviders[request.driver];
        provider.totalRides++;
        provider.rating = ((provider.rating * provider.ratingCount) + rating) / (provider.ratingCount + 1);
        provider.ratingCount++;

        emit RideCompleted(requestId, request.driver, driverAmount);
        emit RatingSubmitted(request.driver, rating, beneficiary);
    }

    function confirmRideCompletion(uint256 requestId, uint256 rating) external {
        confirmRideCompletionFor(msg.sender, requestId, rating);
    }

    /**
     * @dev Driver claims no-show compensation after waiting 5 minutes
     * @param requestId The ride request ID
     * @param proofPhotoHash IPFS hash of photo proof (arrival location)
     */
    function claimRideNoShowCompensation(
        uint256 requestId,
        string memory proofPhotoHash
    ) external nonReentrant {
        RideRequest storage request = rideRequests[requestId];
        require(request.driver == msg.sender, "Not the driver");
        require(request.status == RideStatus.ARRIVED, "Must be at pickup location");
        require(request.arrivalTimestamp > 0, "Arrival not recorded");
        require(block.timestamp >= request.arrivalTimestamp + 5 minutes, "Must wait 5 minutes");
        require(!request.fundsReleased, "Funds already released");
        require(bytes(proofPhotoHash).length > 0, "Photo proof required");

        // Calculate compensation: 40% to driver for gas/time, 60% refund to passenger
        uint256 compensation = (request.escrowAmount * 40) / 100;
        uint256 refund = request.escrowAmount - compensation;

        request.status = RideStatus.NO_SHOW;
        request.completedAt = block.timestamp;
        request.fundsReleased = true;
        request.currentLocationHash = proofPhotoHash; // Store photo proof

        // Pay driver compensation for gas and time
        require(wmonToken.transfer(request.driver, compensation), "Compensation transfer failed");

        // Refund passenger
        require(wmonToken.transfer(request.passenger, refund), "Refund transfer failed");

        emit NoShowCompensationClaimed(ServiceType.RIDE_TRANSPORT, requestId, msg.sender, compensation, proofPhotoHash);
    }

    // ========================================================================
    // DISPUTE MANAGEMENT
    // ========================================================================

    function raiseFoodDispute(uint256 orderId) external {
        FoodOrder storage order = foodOrders[orderId];
        require(order.customer == msg.sender, "Not the customer");
        require(order.status < FoodStatus.COMPLETED, "Already completed");
        require(block.timestamp <= order.createdAt + disputeTimeWindow, "Dispute window closed");

        order.status = FoodStatus.DISPUTED;

        emit DisputeRaised(ServiceType.FOOD_DELIVERY, orderId, msg.sender);
    }

    function raiseRideDispute(uint256 requestId) external {
        RideRequest storage request = rideRequests[requestId];
        require(request.passenger == msg.sender, "Not the passenger");
        require(request.status < RideStatus.COMPLETED, "Already completed");
        require(block.timestamp <= request.createdAt + disputeTimeWindow, "Dispute window closed");

        request.status = RideStatus.DISPUTED;

        emit DisputeRaised(ServiceType.RIDE_TRANSPORT, requestId, msg.sender);
    }

    /**
     * @dev Owner resolves disputes
     */
    function resolveFoodDispute(
        uint256 orderId,
        bool refundCustomer,
        uint256 refundPercent
    ) external onlyOwner {
        FoodOrder storage order = foodOrders[orderId];
        require(order.status == FoodStatus.DISPUTED, "Not disputed");
        require(!order.fundsReleased, "Already released");
        require(refundPercent <= 100, "Invalid percent");

        order.fundsReleased = true;

        if (refundCustomer) {
            uint256 refundAmount = (order.escrowAmount * refundPercent) / 100;
            uint256 providerAmount = order.escrowAmount - refundAmount;

            if (refundAmount > 0) {
                require(wmonToken.transfer(order.customer, refundAmount), "Refund failed");
            }
            if (providerAmount > 0) {
                require(wmonToken.transfer(order.provider, providerAmount), "Provider payment failed");
            }
        } else {
            require(wmonToken.transfer(order.provider, order.escrowAmount), "Provider payment failed");
        }

        order.status = FoodStatus.COMPLETED;
        order.completedAt = block.timestamp;
    }

    function resolveRideDispute(
        uint256 requestId,
        bool refundPassenger,
        uint256 refundPercent
    ) external onlyOwner {
        RideRequest storage request = rideRequests[requestId];
        require(request.status == RideStatus.DISPUTED, "Not disputed");
        require(!request.fundsReleased, "Already released");
        require(refundPercent <= 100, "Invalid percent");

        request.fundsReleased = true;

        if (refundPassenger) {
            uint256 refundAmount = (request.escrowAmount * refundPercent) / 100;
            uint256 driverAmount = request.escrowAmount - refundAmount;

            if (refundAmount > 0) {
                require(wmonToken.transfer(request.passenger, refundAmount), "Refund failed");
            }
            if (driverAmount > 0) {
                require(wmonToken.transfer(request.driver, driverAmount), "Driver payment failed");
            }
        } else {
            require(wmonToken.transfer(request.driver, request.escrowAmount), "Driver payment failed");
        }

        request.status = RideStatus.COMPLETED;
        request.completedAt = block.timestamp;
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function getFoodProvider(address provider) external view returns (
        address providerAddress,
        string memory businessName,
        string memory description,
        bool isActive,
        uint256 totalOrders,
        uint256 rating,
        uint256 ratingCount
    ) {
        FoodProvider storage p = foodProviders[provider];
        return (
            p.providerAddress,
            p.businessName,
            p.description,
            p.isActive,
            p.totalOrders,
            p.rating,
            p.ratingCount
        );
    }

    function getProviderMenu(address provider) external view returns (MenuItem[] memory) {
        return foodProviders[provider].menu;
    }

    function getRideProvider(address driver) external view returns (
        address driverAddress,
        string memory driverName,
        Vehicle memory vehicle,
        bool isActive,
        uint256 totalRides,
        uint256 rating,
        uint256 ratingCount
    ) {
        RideProvider storage p = rideProviders[driver];
        return (
            p.driverAddress,
            p.driverName,
            p.vehicle,
            p.isActive,
            p.totalRides,
            p.rating,
            p.ratingCount
        );
    }

    function getFoodOrder(uint256 orderId) external view returns (FoodOrder memory) {
        return foodOrders[orderId];
    }

    function getRideRequest(uint256 requestId) external view returns (RideRequest memory) {
        return rideRequests[requestId];
    }

    function getActiveFoodProviders() external view returns (address[] memory) {
        return activeFoodProviders;
    }

    function getActiveRideProviders() external view returns (address[] memory) {
        return activeRideProviders;
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setPlatformFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 20, "Fee too high");
        platformFeePercent = newFeePercent;
    }

    function setDisputeTimeWindow(uint256 newWindow) external onlyOwner {
        disputeTimeWindow = newWindow;
    }

    function setPlatformSafe(address newSafe) external onlyOwner {
        require(newSafe != address(0), "Invalid address");
        platformSafe = newSafe;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = wmonToken.balanceOf(address(this));
        require(wmonToken.transfer(owner(), balance), "Transfer failed");
    }

    receive() external payable {}
}
