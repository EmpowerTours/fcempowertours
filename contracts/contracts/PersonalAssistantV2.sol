// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PersonalAssistantV2
 * @notice Personal concierge/assistant marketplace with multi-path verification
 * @author EmpowerTours
 * @dev V2 adds delegation support for gasless service requests via beneficiary pattern
 *
 * VERIFICATION PATHS:
 * 1. STAKE: Pay 100 MON, start working immediately (refundable after 10 jobs)
 * 2. WEB3 IDENTITY: Verify with Gitcoin Passport/World ID/Gov ID, start immediately
 * 3. MANUAL: Platform owner manually verifies (video call, references)
 *
 * EVOLUTION:
 * - Phase 1 (Now): Owner manually verifies all
 * - Phase 2 (Growth): Regional moderators verify locally
 * - Phase 3 (Scale): Community auto-verification after proven track record
 *
 * V2 CHANGES:
 * - Added createServiceRequestFor() for delegated transactions
 * - Platform Safe can create requests on behalf of Farcaster wallet users
 */
contract PersonalAssistantV2 is Ownable, ReentrancyGuard {

    // ========================================================================
    // ENUMS
    // ========================================================================

    enum VerificationPath {
        UNVERIFIED,          // Not yet verified
        STAKE_VERIFIED,      // Paid 100 MON stake
        WEB3_VERIFIED,       // Web3 identity (Gitcoin Passport, World ID, Gov ID)
        MANUAL_VERIFIED,     // Platform owner verified
        COMMUNITY_VERIFIED,  // Auto-verified after 10+ successful jobs
        REGIONAL_VERIFIED    // Regional moderator verified (future)
    }

    enum ServiceRequestStatus {
        PENDING,         // Traveler submitted request
        QUOTED,          // Assistant provided quote
        ACCEPTED,        // Traveler accepted quote, funds in escrow
        IN_PROGRESS,     // Assistant working on it
        COMPLETED,       // Assistant marked completed
        CONFIRMED,       // Traveler confirmed, payment released
        DISPUTED,        // Dispute raised
        CANCELLED        // Cancelled before acceptance
    }

    // ========================================================================
    // STRUCTURES
    // ========================================================================

    struct Assistant {
        address assistantAddress;
        string name;
        string bio;
        string location;              // City, Country
        string[] services;            // ["chef", "driver", "delivery", "guide"]
        string[] specialties;         // ["Ghanaian cuisine", "Airport transfers"]
        string profileImageUrl;
        string contactInfo;           // Encrypted contact (phone/telegram)
        VerificationPath verificationPath;
        uint256 stakeAmount;          // If stake-verified, locked stake
        string web3VerificationProof; // IPFS hash of verification docs
        bool isActive;
        uint256 totalJobs;
        uint256 completedJobs;
        uint256 rating;               // Out of 100
        uint256 ratingCount;
        uint256 disputeCount;
        uint256 registeredAt;
    }

    struct ServiceRequest {
        uint256 requestId;
        address traveler;
        address assistant;
        string serviceType;           // "meal", "transport", "delivery", "guide", "custom"
        string details;               // Free-form description
        uint256 suggestedPrice;       // Traveler's initial suggestion
        uint256 agreedPrice;          // Final agreed price
        uint256 escrowAmount;         // Amount locked in contract
        ServiceRequestStatus status;
        string locationHash;          // IPFS hash of location updates
        uint256 createdAt;
        uint256 acceptedAt;
        uint256 completedAt;
        bool fundsReleased;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    address public platformSafe;

    mapping(address => Assistant) public assistants;
    mapping(uint256 => ServiceRequest) public serviceRequests;
    mapping(address => address) public travelerToAssistant;  // Auto-assigned assistant
    mapping(address => bool) public regionalModerators;      // Can verify assistants

    address[] public allAssistants;
    uint256 private _requestIdCounter;

    uint256 public constant STAKE_AMOUNT = 100 ether;        // 100 MON
    uint256 public constant JOBS_FOR_STAKE_RETURN = 10;      // Jobs needed to get stake back
    uint256 public constant JOBS_FOR_COMMUNITY_VERIFY = 10;  // Jobs for auto-verification
    uint256 public constant MIN_RATING_FOR_AUTO_VERIFY = 45; // 4.5/5 rating

    // Platform fees by verification tier
    uint256 public stakeFeePercent = 3;         // 3% for stake-verified
    uint256 public web3FeePercent = 5;          // 5% for web3-verified (slightly higher risk)
    uint256 public manualFeePercent = 2;        // 2% for manually verified (premium)
    uint256 public communityFeePercent = 2;     // 2% for community-verified (proven)

    // ========================================================================
    // EVENTS
    // ========================================================================

    event AssistantRegistered(
        address indexed assistant,
        string name,
        VerificationPath verificationPath,
        uint256 stakeAmount
    );
    event AssistantVerified(address indexed assistant, VerificationPath newPath);
    event AssistantAssigned(address indexed traveler, address indexed assistant);
    event ServiceRequestCreated(
        uint256 indexed requestId,
        address indexed traveler,
        address indexed assistant,
        string serviceType,
        uint256 suggestedPrice
    );
    event ServiceQuoted(uint256 indexed requestId, uint256 quotedPrice);
    event ServiceAccepted(uint256 indexed requestId, uint256 escrowAmount);
    event ServiceCompleted(uint256 indexed requestId);
    event ServiceConfirmed(
        uint256 indexed requestId,
        address indexed assistant,
        uint256 paymentAmount,
        uint256 rating
    );
    event DisputeRaised(uint256 indexed requestId, address indexed raiser);
    event StakeReturned(address indexed assistant, uint256 amount);
    event RegionalModeratorAdded(address indexed moderator);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(address _platformSafe) Ownable(msg.sender) {
        require(_platformSafe != address(0), "Invalid platform safe");
        platformSafe = _platformSafe;
    }

    // ========================================================================
    // ASSISTANT REGISTRATION (Multi-Path)
    // ========================================================================

    /**
     * @notice PATH 1: Register with 100 MON stake (instant access)
     */
    function registerWithStake(
        string memory name,
        string memory bio,
        string memory location,
        string[] memory services,
        string memory profileImageUrl,
        string memory contactInfo
    ) external payable {
        require(msg.value >= STAKE_AMOUNT, "Insufficient stake (need 100 MON)");
        require(!assistants[msg.sender].isActive, "Already registered");
        require(bytes(name).length > 0, "Name required");

        Assistant storage assistant = assistants[msg.sender];
        assistant.assistantAddress = msg.sender;
        assistant.name = name;
        assistant.bio = bio;
        assistant.location = location;
        assistant.services = services;
        assistant.profileImageUrl = profileImageUrl;
        assistant.contactInfo = contactInfo;
        assistant.verificationPath = VerificationPath.STAKE_VERIFIED;
        assistant.stakeAmount = msg.value;
        assistant.isActive = true;
        assistant.registeredAt = block.timestamp;

        allAssistants.push(msg.sender);

        emit AssistantRegistered(msg.sender, name, VerificationPath.STAKE_VERIFIED, msg.value);
    }

    /**
     * @notice PATH 2: Register with Web3 identity verification (free, instant)
     * @param verificationProofHash IPFS hash containing verification data
     *        (Gitcoin Passport score, World ID, Gov ID scan, etc.)
     */
    function registerWithWeb3Identity(
        string memory name,
        string memory bio,
        string memory location,
        string[] memory services,
        string memory profileImageUrl,
        string memory contactInfo,
        string memory verificationProofHash
    ) external {
        require(!assistants[msg.sender].isActive, "Already registered");
        require(bytes(name).length > 0, "Name required");
        require(bytes(verificationProofHash).length > 0, "Verification proof required");

        Assistant storage assistant = assistants[msg.sender];
        assistant.assistantAddress = msg.sender;
        assistant.name = name;
        assistant.bio = bio;
        assistant.location = location;
        assistant.services = services;
        assistant.profileImageUrl = profileImageUrl;
        assistant.contactInfo = contactInfo;
        assistant.verificationPath = VerificationPath.WEB3_VERIFIED;
        assistant.web3VerificationProof = verificationProofHash;
        assistant.isActive = true;
        assistant.registeredAt = block.timestamp;

        allAssistants.push(msg.sender);

        emit AssistantRegistered(msg.sender, name, VerificationPath.WEB3_VERIFIED, 0);
    }

    /**
     * @notice PATH 3: Register and wait for manual verification
     */
    function registerForManualVerification(
        string memory name,
        string memory bio,
        string memory location,
        string[] memory services,
        string memory profileImageUrl,
        string memory contactInfo,
        string memory applicationDetails  // Why you want to be an assistant, references, etc.
    ) external {
        require(!assistants[msg.sender].isActive, "Already registered");
        require(bytes(name).length > 0, "Name required");

        Assistant storage assistant = assistants[msg.sender];
        assistant.assistantAddress = msg.sender;
        assistant.name = name;
        assistant.bio = bio;
        assistant.location = location;
        assistant.services = services;
        assistant.profileImageUrl = profileImageUrl;
        assistant.contactInfo = contactInfo;
        assistant.verificationPath = VerificationPath.UNVERIFIED;
        assistant.web3VerificationProof = applicationDetails;  // Store application here
        assistant.isActive = false;  // Not active until manually verified
        assistant.registeredAt = block.timestamp;

        allAssistants.push(msg.sender);

        emit AssistantRegistered(msg.sender, name, VerificationPath.UNVERIFIED, 0);
    }

    /**
     * @notice Owner manually verifies assistant (PATH 3 completion)
     */
    function approveManualVerification(address assistantAddress) external onlyOwner {
        Assistant storage assistant = assistants[assistantAddress];
        require(assistant.assistantAddress != address(0), "Not registered");
        require(assistant.verificationPath == VerificationPath.UNVERIFIED, "Already verified");

        assistant.verificationPath = VerificationPath.MANUAL_VERIFIED;
        assistant.isActive = true;

        emit AssistantVerified(assistantAddress, VerificationPath.MANUAL_VERIFIED);
    }

    /**
     * @notice Regional moderator verifies assistant (future use)
     */
    function regionalVerifyAssistant(address assistantAddress) external {
        require(regionalModerators[msg.sender], "Not a regional moderator");

        Assistant storage assistant = assistants[assistantAddress];
        require(assistant.assistantAddress != address(0), "Not registered");
        require(assistant.verificationPath == VerificationPath.UNVERIFIED, "Already verified");

        assistant.verificationPath = VerificationPath.REGIONAL_VERIFIED;
        assistant.isActive = true;

        emit AssistantVerified(assistantAddress, VerificationPath.REGIONAL_VERIFIED);
    }

    // ========================================================================
    // AUTO-VERIFICATION & STAKE RETURN
    // ========================================================================

    /**
     * @notice Auto-upgrade to community verified after proven track record
     */
    function checkAndUpgradeTier(address assistantAddress) internal {
        Assistant storage assistant = assistants[assistantAddress];

        // Auto-upgrade stake-verified to community-verified
        if (
            assistant.verificationPath == VerificationPath.STAKE_VERIFIED &&
            assistant.completedJobs >= JOBS_FOR_STAKE_RETURN &&
            assistant.rating >= MIN_RATING_FOR_AUTO_VERIFY &&
            assistant.disputeCount == 0
        ) {
            // Upgrade tier
            assistant.verificationPath = VerificationPath.COMMUNITY_VERIFIED;

            // Return stake
            uint256 stakeToReturn = assistant.stakeAmount;
            assistant.stakeAmount = 0;
            payable(assistantAddress).transfer(stakeToReturn);

            emit AssistantVerified(assistantAddress, VerificationPath.COMMUNITY_VERIFIED);
            emit StakeReturned(assistantAddress, stakeToReturn);
        }

        // Also upgrade web3-verified to community-verified
        if (
            assistant.verificationPath == VerificationPath.WEB3_VERIFIED &&
            assistant.completedJobs >= JOBS_FOR_COMMUNITY_VERIFY &&
            assistant.rating >= MIN_RATING_FOR_AUTO_VERIFY &&
            assistant.disputeCount == 0
        ) {
            assistant.verificationPath = VerificationPath.COMMUNITY_VERIFIED;
            emit AssistantVerified(assistantAddress, VerificationPath.COMMUNITY_VERIFIED);
        }
    }

    // ========================================================================
    // SERVICE REQUESTS
    // ========================================================================

    /**
     * @notice Assign assistant to traveler (called when they book experience)
     */
    function assignAssistantToTraveler(
        address traveler,
        address assistant
    ) external onlyOwner {
        require(assistants[assistant].isActive, "Assistant not active");
        travelerToAssistant[traveler] = assistant;
        emit AssistantAssigned(traveler, assistant);
    }

    /**
     * @notice Create service request on behalf of traveler (delegation support)
     * @param beneficiary The actual traveler requesting service
     * @dev Allows Platform Safe to create requests for Farcaster wallet users
     */
    function createServiceRequestFor(
        address beneficiary,
        string memory serviceType,
        string memory details,
        uint256 suggestedPrice
    ) public returns (uint256) {
        address assistant = travelerToAssistant[beneficiary];
        require(assistant != address(0), "No assistant assigned");
        require(assistants[assistant].isActive, "Assistant not active");

        uint256 requestId = _requestIdCounter++;

        ServiceRequest storage request = serviceRequests[requestId];
        request.requestId = requestId;
        request.traveler = beneficiary;
        request.assistant = assistant;
        request.serviceType = serviceType;
        request.details = details;
        request.suggestedPrice = suggestedPrice;
        request.status = ServiceRequestStatus.PENDING;
        request.createdAt = block.timestamp;

        emit ServiceRequestCreated(requestId, beneficiary, assistant, serviceType, suggestedPrice);

        return requestId;
    }

    /**
     * @notice Traveler creates service request (legacy - user pays own gas)
     */
    function createServiceRequest(
        string memory serviceType,
        string memory details,
        uint256 suggestedPrice
    ) external returns (uint256) {
        return createServiceRequestFor(msg.sender, serviceType, details, suggestedPrice);
    }

    /**
     * @notice Assistant confirms/quotes service
     */
    function quoteServiceRequest(uint256 requestId, uint256 quotedPrice) external {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.assistant == msg.sender, "Not the assistant");
        require(request.status == ServiceRequestStatus.PENDING, "Invalid status");
        require(quotedPrice > 0, "Invalid price");

        request.agreedPrice = quotedPrice;
        request.status = ServiceRequestStatus.QUOTED;

        emit ServiceQuoted(requestId, quotedPrice);
    }

    /**
     * @notice Traveler accepts quote and pays (funds to escrow)
     */
    function acceptQuoteAndPay(uint256 requestId) external payable nonReentrant {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.traveler == msg.sender, "Not the traveler");
        require(request.status == ServiceRequestStatus.QUOTED, "Not quoted yet");
        require(msg.value >= request.agreedPrice, "Insufficient payment");

        request.escrowAmount = msg.value;
        request.status = ServiceRequestStatus.ACCEPTED;
        request.acceptedAt = block.timestamp;

        // Increment total jobs
        assistants[request.assistant].totalJobs++;

        emit ServiceAccepted(requestId, msg.value);
    }

    /**
     * @notice Assistant marks service as completed
     */
    function markServiceCompleted(uint256 requestId) external {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.assistant == msg.sender, "Not the assistant");
        require(request.status == ServiceRequestStatus.ACCEPTED, "Not accepted yet");

        request.status = ServiceRequestStatus.COMPLETED;
        request.completedAt = block.timestamp;

        emit ServiceCompleted(requestId);
    }

    /**
     * @notice Traveler confirms service and releases payment
     */
    function confirmServiceCompletion(
        uint256 requestId,
        uint256 rating
    ) external nonReentrant {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.traveler == msg.sender, "Not the traveler");
        require(request.status == ServiceRequestStatus.COMPLETED, "Not completed");
        require(!request.fundsReleased, "Already released");
        require(rating <= 100, "Invalid rating");

        Assistant storage assistant = assistants[request.assistant];

        // Calculate platform fee based on verification tier
        uint256 feePercent = getPlatformFee(request.assistant);
        uint256 platformFee = (request.escrowAmount * feePercent) / 100;
        uint256 assistantPayment = request.escrowAmount - platformFee;

        // Release funds
        request.fundsReleased = true;
        request.status = ServiceRequestStatus.CONFIRMED;

        payable(request.assistant).transfer(assistantPayment);
        payable(platformSafe).transfer(platformFee);

        // Update assistant stats
        assistant.completedJobs++;
        assistant.rating = ((assistant.rating * assistant.ratingCount) + rating) / (assistant.ratingCount + 1);
        assistant.ratingCount++;

        // Check if eligible for tier upgrade
        checkAndUpgradeTier(request.assistant);

        emit ServiceConfirmed(requestId, request.assistant, assistantPayment, rating);
    }

    /**
     * @notice Get platform fee percentage based on verification tier
     */
    function getPlatformFee(address assistantAddress) public view returns (uint256) {
        VerificationPath path = assistants[assistantAddress].verificationPath;

        if (path == VerificationPath.MANUAL_VERIFIED || path == VerificationPath.COMMUNITY_VERIFIED) {
            return manualFeePercent;  // 2% (premium/proven)
        } else if (path == VerificationPath.STAKE_VERIFIED) {
            return stakeFeePercent;   // 3% (standard)
        } else if (path == VerificationPath.WEB3_VERIFIED) {
            return web3FeePercent;    // 5% (slightly higher risk)
        } else {
            return 10;  // 10% for unverified (shouldn't happen if isActive checks work)
        }
    }

    // ========================================================================
    // DISPUTE MANAGEMENT
    // ========================================================================

    function raiseDispute(uint256 requestId) external {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.traveler == msg.sender, "Not the traveler");
        require(request.status < ServiceRequestStatus.CONFIRMED, "Already confirmed");
        require(!request.fundsReleased, "Funds already released");

        request.status = ServiceRequestStatus.DISPUTED;
        assistants[request.assistant].disputeCount++;

        emit DisputeRaised(requestId, msg.sender);
    }

    function resolveDispute(
        uint256 requestId,
        uint256 refundPercent  // 0-100
    ) external onlyOwner nonReentrant {
        ServiceRequest storage request = serviceRequests[requestId];
        require(request.status == ServiceRequestStatus.DISPUTED, "Not disputed");
        require(!request.fundsReleased, "Already released");
        require(refundPercent <= 100, "Invalid percent");

        request.fundsReleased = true;

        uint256 refundAmount = (request.escrowAmount * refundPercent) / 100;
        uint256 assistantAmount = request.escrowAmount - refundAmount;

        if (refundAmount > 0) {
            payable(request.traveler).transfer(refundAmount);
        }
        if (assistantAmount > 0) {
            payable(request.assistant).transfer(assistantAmount);
        }

        request.status = ServiceRequestStatus.CONFIRMED;
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function addRegionalModerator(address moderator) external onlyOwner {
        regionalModerators[moderator] = true;
        emit RegionalModeratorAdded(moderator);
    }

    function removeRegionalModerator(address moderator) external onlyOwner {
        regionalModerators[moderator] = false;
    }

    function setPlatformFees(
        uint256 _stakeFee,
        uint256 _web3Fee,
        uint256 _manualFee,
        uint256 _communityFee
    ) external onlyOwner {
        require(_stakeFee <= 10 && _web3Fee <= 10 && _manualFee <= 10 && _communityFee <= 10, "Fee too high");
        stakeFeePercent = _stakeFee;
        web3FeePercent = _web3Fee;
        manualFeePercent = _manualFee;
        communityFeePercent = _communityFee;
    }

    function deactivateAssistant(address assistantAddress) external onlyOwner {
        assistants[assistantAddress].isActive = false;
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function getAssistant(address assistantAddress) external view returns (Assistant memory) {
        return assistants[assistantAddress];
    }

    function getServiceRequest(uint256 requestId) external view returns (ServiceRequest memory) {
        return serviceRequests[requestId];
    }

    function getAllAssistants() external view returns (address[] memory) {
        return allAssistants;
    }

    function getActiveAssistants() external view returns (address[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allAssistants.length; i++) {
            if (assistants[allAssistants[i]].isActive) {
                activeCount++;
            }
        }

        address[] memory active = new address[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allAssistants.length; i++) {
            if (assistants[allAssistants[i]].isActive) {
                active[index] = allAssistants[i];
                index++;
            }
        }

        return active;
    }

    receive() external payable {}
}
