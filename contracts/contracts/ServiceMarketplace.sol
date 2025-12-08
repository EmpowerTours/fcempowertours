// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ServiceMarketplace
 * @notice Decentralized marketplace for food delivery and ride services with escrow
 * @dev Supports delegation via beneficiary pattern for gasless transactions
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
        DISPUTED        // Dispute raised
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
        DISPUTED        // Dispute raised
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
        address deliveryPerson; // Associated delivery person
        MenuItem[] menu;
        bool isActive;
        uint256 totalOrders;
        uint256 rating;         // Out of 100
        uint256 ratingCount;
        uint256 registeredAt;
    }

    struct Vehicle {
        string vehicleType;     // Car, Motorcycle, Bicycle
        string model;
        string licensePlate;
        uint256 capacity;       // Number of passengers
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
        address deliveryPerson;
        uint256[] menuItemIds;
        uint256[] quantities;
        uint256 totalAmount;
        uint256 escrowAmount;
        FoodStatus status;
        string deliveryAddress;
        string locationHash;    // IPFS hash of current location
        uint256 createdAt;
        uint256 completedAt;
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
        bool fundsReleased;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    IERC20 public toursToken;
    address public platformSafe;

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

    uint256 public platformFeePercent = 5; // 5% platform fee
    uint256 public disputeTimeWindow = 24 hours;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event FoodProviderRegistered(address indexed provider, string businessName);
    event RideProviderRegistered(address indexed driver, string driverName);
    event MenuItemAdded(address indexed provider, uint256 itemId, string name, uint256 price);

    event FoodOrderCreated(uint256 indexed orderId, address indexed customer, address indexed provider, uint256 totalAmount);
    event FoodOrderStatusUpdated(uint256 indexed orderId, FoodStatus status, string locationHash);
    event FoodOrderCompleted(uint256 indexed orderId, address indexed provider, uint256 amount);

    event RideRequestCreated(uint256 indexed requestId, address indexed passenger, uint256 agreedPrice);
    event RideRequestAccepted(uint256 indexed requestId, address indexed driver);
    event RideStatusUpdated(uint256 indexed requestId, RideStatus status, string locationHash);
    event RideCompleted(uint256 indexed requestId, address indexed driver, uint256 amount);

    event DisputeRaised(ServiceType serviceType, uint256 indexed id, address indexed raiser);
    event RatingSubmitted(address indexed provider, uint256 rating, address indexed rater);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _toursToken,
        address _platformSafe
    ) Ownable(msg.sender) {
        require(_toursToken != address(0), "Invalid TOURS token");
        require(_platformSafe != address(0), "Invalid platform safe");
        toursToken = IERC20(_toursToken);
        platformSafe = _platformSafe;
    }

    // ========================================================================
    // FOOD PROVIDER REGISTRATION
    // ========================================================================

    function registerFoodProvider(
        string memory businessName,
        string memory description,
        address deliveryPerson
    ) external {
        require(bytes(businessName).length > 0, "Business name required");
        require(deliveryPerson != address(0), "Delivery person required");
        require(!foodProviders[msg.sender].isActive, "Already registered");

        FoodProvider storage provider = foodProviders[msg.sender];
        provider.providerAddress = msg.sender;
        provider.businessName = businessName;
        provider.description = description;
        provider.deliveryPerson = deliveryPerson;
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
     */
    function createFoodOrderFor(
        address beneficiary,
        address provider,
        uint256[] memory menuItemIds,
        uint256[] memory quantities,
        string memory deliveryAddress
    ) external nonReentrant returns (uint256) {
        require(foodProviders[provider].isActive, "Provider not active");
        require(menuItemIds.length == quantities.length, "Array length mismatch");
        require(menuItemIds.length > 0, "No items");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < menuItemIds.length; i++) {
            require(menuItemIds[i] < foodProviders[provider].menu.length, "Invalid menu item");
            MenuItem memory item = foodProviders[provider].menu[menuItemIds[i]];
            require(item.available, "Item not available");
            totalAmount += item.price * quantities[i];
        }

        uint256 orderId = _orderIdCounter++;

        // Transfer funds to escrow
        require(
            toursToken.transferFrom(beneficiary, address(this), totalAmount),
            "Transfer failed"
        );

        FoodOrder storage order = foodOrders[orderId];
        order.orderId = orderId;
        order.customer = beneficiary;
        order.provider = provider;
        order.deliveryPerson = foodProviders[provider].deliveryPerson;
        order.menuItemIds = menuItemIds;
        order.quantities = quantities;
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
        string memory deliveryAddress
    ) external returns (uint256) {
        return createFoodOrderFor(msg.sender, provider, menuItemIds, quantities, deliveryAddress);
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
     * @dev Update food preparation status with location
     */
    function updateFoodStatus(
        uint256 orderId,
        FoodStatus newStatus,
        string memory locationHash
    ) external {
        FoodOrder storage order = foodOrders[orderId];
        require(
            msg.sender == order.provider || msg.sender == order.deliveryPerson,
            "Not authorized"
        );
        require(order.status < FoodStatus.DELIVERED, "Order finalized");

        order.status = newStatus;
        order.locationHash = locationHash;

        emit FoodOrderStatusUpdated(orderId, newStatus, locationHash);
    }

    /**
     * @dev Customer confirms food delivery - releases escrow
     */
    function confirmFoodDeliveryFor(
        address beneficiary,
        uint256 orderId,
        uint256 rating
    ) external nonReentrant {
        FoodOrder storage order = foodOrders[orderId];
        require(order.customer == beneficiary, "Not the customer");
        require(order.status == FoodStatus.DELIVERED, "Not delivered yet");
        require(!order.fundsReleased, "Already released");
        require(rating <= 100, "Invalid rating");

        order.status = FoodStatus.COMPLETED;
        order.completedAt = block.timestamp;
        order.fundsReleased = true;

        // Calculate platform fee
        uint256 platformFee = (order.escrowAmount * platformFeePercent) / 100;
        uint256 providerAmount = order.escrowAmount - platformFee;

        // Release funds
        require(toursToken.transfer(order.provider, providerAmount), "Provider payment failed");
        require(toursToken.transfer(platformSafe, platformFee), "Fee transfer failed");

        // Update provider stats
        FoodProvider storage provider = foodProviders[order.provider];
        provider.totalOrders++;
        provider.rating = ((provider.rating * provider.ratingCount) + rating) / (provider.ratingCount + 1);
        provider.ratingCount++;

        emit FoodOrderCompleted(orderId, order.provider, providerAmount);
        emit RatingSubmitted(order.provider, rating, beneficiary);
    }

    function confirmFoodDelivery(uint256 orderId, uint256 rating) external {
        confirmFoodDeliveryFor(msg.sender, orderId, rating);
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
    ) external nonReentrant returns (uint256) {
        require(agreedPrice > 0, "Invalid price");
        require(capacity > 0, "Invalid capacity");

        uint256 requestId = _requestIdCounter++;

        // Transfer funds to escrow
        require(
            toursToken.transferFrom(beneficiary, address(this), agreedPrice),
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

        emit RideStatusUpdated(requestId, newStatus, locationHash);
    }

    /**
     * @dev Passenger confirms ride completion - releases escrow
     */
    function confirmRideCompletionFor(
        address beneficiary,
        uint256 requestId,
        uint256 rating
    ) external nonReentrant {
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
        require(toursToken.transfer(request.driver, driverAmount), "Driver payment failed");
        require(toursToken.transfer(platformSafe, platformFee), "Fee transfer failed");

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
                require(toursToken.transfer(order.customer, refundAmount), "Refund failed");
            }
            if (providerAmount > 0) {
                require(toursToken.transfer(order.provider, providerAmount), "Provider payment failed");
            }
        } else {
            require(toursToken.transfer(order.provider, order.escrowAmount), "Provider payment failed");
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
                require(toursToken.transfer(request.passenger, refundAmount), "Refund failed");
            }
            if (driverAmount > 0) {
                require(toursToken.transfer(request.driver, driverAmount), "Driver payment failed");
            }
        } else {
            require(toursToken.transfer(request.driver, request.escrowAmount), "Driver payment failed");
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
        address deliveryPerson,
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
            p.deliveryPerson,
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
        uint256 balance = toursToken.balanceOf(address(this));
        require(toursToken.transfer(owner(), balance), "Transfer failed");
    }

    receive() external payable {}
}
