// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IEmpowerToursYieldStrategyV9
 * @notice Interface for YieldStrategy V9 (two-step unstaking)
 */
interface IEmpowerToursYieldStrategyV9 {
    function stakeWithDeposit(address nftAddress, uint256 nftTokenId, address beneficiary) external payable returns (uint256);
    function requestUnstake(uint256 positionId) external returns (uint96 expectedSpotValue);
    function finalizeUnstake(uint256 positionId) external returns (uint256 netRefund);
    function getPortfolioValue(address user) external view returns (uint256);
    function getUserPositions(address user) external view returns (uint256[] memory);
}

/**
 * @title PassportNFTv4
 * @notice Empower Tours Passport V4 - Anti-Spam Protection + Location Verification
 * @dev V4 Features:
 * - 24-hour cooldown between mints
 * - Progressive pricing (gets expensive with more passports)
 * - Passports are "unverified" by default
 * - Optional location verification (GPS/attestation/photo)
 * - Verified passports get enhanced benefits
 */
contract PassportNFTv4 is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Anti-Spam Configuration
    // ============================================
    uint256 public constant BASE_MINT_PRICE = 0.01 ether; // 0.01 MON
    uint256 public constant MINT_COOLDOWN = 24 hours;
    uint256 public constant PROGRESSIVE_PRICE_DIVIDER = 10; // Price increases by 10% per 10 passports

    uint256 private _tokenIdCounter;
    IEmpowerToursYieldStrategyV9 public yieldStrategy;

    struct PassportMetadata {
        string countryCode;
        string countryName;
        string region;
        string continent;
        uint256 mintedAt;
        bool verified;              // NEW: Is location verified?
        string verificationProof;   // NEW: IPFS hash of verification proof (GPS/photo/attestation)
        uint256 verifiedAt;         // NEW: Timestamp when verified
    }

    struct VenueStamp {
        string location;
        string eventType;
        address artist;
        uint256 timestamp;
        bool verified;
    }

    struct ItineraryStamp {
        uint256 itineraryId;
        string locationName;
        string city;
        string country;
        uint256 stampedAt;
        bool gpsVerified;
    }

    // ============================================
    // Storage
    // ============================================
    mapping(uint256 => PassportMetadata) public passportData;
    mapping(address => mapping(string => uint256)) public userPassports;
    mapping(uint256 => VenueStamp[]) public passportStamps;
    mapping(uint256 => uint256) public passportStakedAmount;
    mapping(uint256 => ItineraryStamp[]) public itineraryStamps;
    mapping(uint256 => uint256[]) public passportStakingPositions;

    // NEW: Anti-spam tracking
    mapping(address => uint256) public lastMintTime;
    mapping(address => uint256) public totalMinted;

    // NEW: Trusted verifiers (can verify location proofs)
    mapping(address => bool) public trustedVerifiers;

    // ============================================
    // Events
    // ============================================
    event PassportMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string countryCode,
        string countryName,
        string region,
        string continent,
        bool verified
    );
    event PassportVerified(uint256 indexed tokenId, string verificationProof, uint256 timestamp);
    event VerificationProofSubmitted(uint256 indexed tokenId, address indexed submitter, string proofIPFSHash, uint256 timestamp); // NEW
    event PassportStaked(uint256 indexed tokenId, uint256 monAmount, uint256 positionId);
    event VenueStampAdded(uint256 indexed tokenId, string location, string eventType, uint256 timestamp);
    event ItineraryStampAdded(uint256 indexed tokenId, uint256 indexed itineraryId, string location, uint256 timestamp);
    event UnstakeRequested(uint256 indexed tokenId, uint256 indexed positionId);
    event UnstakeFinalized(uint256 indexed tokenId, uint256 indexed positionId, uint256 monReturned);
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);

    constructor(address _yieldStrategy)
        ERC721("EmpowerTours Passport V4", "ETPASS-V4")
        Ownable(msg.sender)
    {
        require(_yieldStrategy != address(0), "Invalid strategy");
        yieldStrategy = IEmpowerToursYieldStrategyV9(_yieldStrategy);
        trustedVerifiers[msg.sender] = true; // Owner is default verifier
    }

    // ============================================
    // Minting Functions - WITH ANTI-SPAM
    // ============================================

    /**
     * @notice Calculate mint price for a user (progressive pricing)
     * @dev Price = BASE_PRICE * (1 + totalMinted/10)
     * @param user Address to check
     * @return price The current mint price for this user
     */
    function getMintPrice(address user) public view returns (uint256) {
        uint256 userMintCount = totalMinted[user];
        uint256 priceMultiplier = 100 + (userMintCount * 100) / PROGRESSIVE_PRICE_DIVIDER;
        return (BASE_MINT_PRICE * priceMultiplier) / 100;
    }

    /**
     * @notice Check if user is on cooldown
     * @param user Address to check
     * @return isOnCooldown True if user must wait before minting
     * @return timeRemaining Seconds until cooldown ends (0 if not on cooldown)
     */
    function getCooldownStatus(address user) public view returns (bool isOnCooldown, uint256 timeRemaining) {
        uint256 nextMintTime = lastMintTime[user] + MINT_COOLDOWN;
        if (block.timestamp < nextMintTime) {
            return (true, nextMintTime - block.timestamp);
        }
        return (false, 0);
    }

    /**
     * @notice Mint passport with anti-spam protection
     * @dev Enforces 24hr cooldown + progressive pricing
     */
    function mint(
        address to,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri
    ) external payable returns (uint256) {
        require(to != address(0), "Invalid recipient");
        require(userPassports[to][countryCode] == 0, "Already own passport for this country");

        // Anti-spam checks
        (bool isOnCooldown, uint256 timeRemaining) = getCooldownStatus(to);
        require(!isOnCooldown, string(abi.encodePacked("Cooldown active: ", _uint2str(timeRemaining), "s remaining")));

        uint256 requiredPrice = getMintPrice(to);
        require(msg.value >= requiredPrice, "Insufficient payment");

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        passportData[tokenId] = PassportMetadata({
            countryCode: countryCode,
            countryName: countryName,
            region: region,
            continent: continent,
            mintedAt: block.timestamp,
            verified: false,              // Unverified by default
            verificationProof: "",
            verifiedAt: 0
        });

        userPassports[to][countryCode] = tokenId;
        lastMintTime[to] = block.timestamp;
        totalMinted[to]++;

        emit PassportMinted(tokenId, to, countryCode, countryName, region, continent, false);
        return tokenId;
    }

    // ============================================
    // Verification Functions
    // ============================================

    /**
     * @notice Verify passport with location proof
     * @dev Can be called by trusted verifiers or owner
     * @param tokenId Passport to verify
     * @param proofIPFSHash IPFS hash of verification proof (GPS data, photo, attestation)
     */
    function verifyPassport(uint256 tokenId, string memory proofIPFSHash) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(trustedVerifiers[msg.sender] || msg.sender == owner(), "Not authorized verifier");
        require(!passportData[tokenId].verified, "Already verified");

        passportData[tokenId].verified = true;
        passportData[tokenId].verificationProof = proofIPFSHash;
        passportData[tokenId].verifiedAt = block.timestamp;

        emit PassportVerified(tokenId, proofIPFSHash, block.timestamp);
    }

    /**
     * @notice Self-verify passport (user submits proof, verifier approves off-chain first)
     * @dev User must be passport owner
     * @dev Emits event for verifiers to monitor pending verifications
     */
    function submitVerificationProof(uint256 tokenId, string memory proofIPFSHash) external {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");
        require(!passportData[tokenId].verified, "Already verified");

        // Store proof for manual review by verifiers
        passportData[tokenId].verificationProof = proofIPFSHash;
        // Note: verified remains false until verifier approves

        // Emit event for verifiers to monitor
        emit VerificationProofSubmitted(tokenId, msg.sender, proofIPFSHash, block.timestamp);
    }

    /**
     * @notice Check if passport is verified
     */
    function isVerified(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId].verified;
    }

    // ============================================
    // Staking Functions (V9 Compatible)
    // ============================================

    function stakeWithPassport(uint256 tokenId) external payable nonReentrant returns (uint256 positionId) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");
        require(msg.value > 0, "Amount must be > 0");

        positionId = yieldStrategy.stakeWithDeposit{value: msg.value}(
            address(this),
            tokenId,
            msg.sender
        );

        passportStakingPositions[tokenId].push(positionId);
        passportStakedAmount[tokenId] += msg.value;

        emit PassportStaked(tokenId, msg.value, positionId);
        return positionId;
    }

    function requestUnstake(uint256 tokenId, uint256 positionId) external nonReentrant returns (uint96 expectedSpotValue) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");

        expectedSpotValue = yieldStrategy.requestUnstake(positionId);

        emit UnstakeRequested(tokenId, positionId);
        return expectedSpotValue;
    }

    function finalizeUnstake(uint256 tokenId, uint256 positionId) external nonReentrant returns (uint256 netRefund) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");

        netRefund = yieldStrategy.finalizeUnstake(positionId);

        (bool success, ) = msg.sender.call{value: netRefund}("");
        require(success, "MON transfer failed");

        emit UnstakeFinalized(tokenId, positionId, netRefund);
        return netRefund;
    }

    // ============================================
    // Stamps Functions
    // ============================================

    function addVenueStamp(
        uint256 tokenId,
        string memory location,
        string memory eventType,
        address artist,
        bool verified
    ) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(
            msg.sender == owner() ||
            msg.sender == address(yieldStrategy) ||
            msg.sender == _ownerOf(tokenId),
            "Unauthorized"
        );

        passportStamps[tokenId].push(VenueStamp({
            location: location,
            eventType: eventType,
            artist: artist,
            timestamp: block.timestamp,
            verified: verified
        }));

        emit VenueStampAdded(tokenId, location, eventType, block.timestamp);
    }

    function addItineraryStamp(
        uint256 tokenId,
        uint256 itineraryId,
        string memory locationName,
        string memory city,
        string memory country,
        bool gpsVerified
    ) external {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(
            msg.sender == owner() ||
            msg.sender == _ownerOf(tokenId),
            "Unauthorized"
        );

        itineraryStamps[tokenId].push(ItineraryStamp({
            itineraryId: itineraryId,
            locationName: locationName,
            city: city,
            country: country,
            stampedAt: block.timestamp,
            gpsVerified: gpsVerified
        }));

        emit ItineraryStampAdded(tokenId, itineraryId, locationName, block.timestamp);
    }

    // ============================================
    // Credit Score & Portfolio (Enhanced for Verification)
    // ============================================

    /**
     * @notice Calculate credit score with verification bonus
     * @dev Verified passports get 2x multiplier on all bonuses
     */
    function getCreditScore(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        uint256 stakedUnits = passportStakedAmount[tokenId] / 1e18;
        uint256 venueStampBonus = passportStamps[tokenId].length * 10;
        uint256 itineraryStampBonus = itineraryStamps[tokenId].length * 15;

        uint256 verifiedBonus = 0;
        for (uint256 i = 0; i < passportStamps[tokenId].length; i++) {
            if (passportStamps[tokenId][i].verified) {
                verifiedBonus += 5;
            }
        }

        for (uint256 i = 0; i < itineraryStamps[tokenId].length; i++) {
            if (itineraryStamps[tokenId][i].gpsVerified) {
                verifiedBonus += 10;
            }
        }

        uint256 baseScore = 100 + stakedUnits + venueStampBonus + itineraryStampBonus + verifiedBonus;

        // VERIFICATION BOOST: Verified passports get 2x multiplier on bonuses
        if (passportData[tokenId].verified) {
            uint256 bonuses = stakedUnits + venueStampBonus + itineraryStampBonus + verifiedBonus;
            return 100 + (bonuses * 2); // Double all bonuses for verified passports
        }

        return baseScore;
    }

    function getPassportPortfolioValue(uint256 tokenId) external view returns (uint256) {
        address ownerAddr = _ownerOf(tokenId);
        require(ownerAddr != address(0), "Token does not exist");

        uint256 baseValue = yieldStrategy.getPortfolioValue(ownerAddr);
        uint256 totalStamps = passportStamps[tokenId].length + itineraryStamps[tokenId].length;

        // Verified passports get 20% boost per 10 stamps (vs 10% for unverified)
        uint256 boostPercentPerTenStamps = passportData[tokenId].verified ? 20 : 10;
        uint256 boostPercent = totalStamps > 10 ? boostPercentPerTenStamps * (totalStamps / 10) : (totalStamps * boostPercentPerTenStamps) / 10;
        uint256 boost = (baseValue * boostPercent) / 100;

        return baseValue + boost;
    }

    // ============================================
    // View Functions
    // ============================================

    function hasPassport(address user, string memory countryCode) public view returns (bool) {
        return userPassports[user][countryCode] != 0;
    }

    function getPassportData(uint256 tokenId) public view returns (PassportMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId];
    }

    function getPassportStamps(uint256 tokenId) external view returns (VenueStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId];
    }

    function getItineraryStamps(uint256 tokenId) external view returns (ItineraryStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return itineraryStamps[tokenId];
    }

    function getStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length;
    }

    function getTotalStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length + itineraryStamps[tokenId].length;
    }

    function hasVisitedCity(uint256 tokenId, string memory city) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        ItineraryStamp[] memory stamps = itineraryStamps[tokenId];
        for (uint256 i = 0; i < stamps.length; i++) {
            if (keccak256(bytes(stamps[i].city)) == keccak256(bytes(city))) {
                return true;
            }
        }
        return false;
    }

    function getPassportStakedAmount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStakedAmount[tokenId];
    }

    function getPassportStakingPositions(uint256 tokenId) external view returns (uint256[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStakingPositions[tokenId];
    }

    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    function getUserMintCount(address user) external view returns (uint256) {
        return totalMinted[user];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid address");
        trustedVerifiers[verifier] = true;
        emit VerifierAdded(verifier);
    }

    function removeVerifier(address verifier) external onlyOwner {
        trustedVerifiers[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    function updateYieldStrategy(address newStrategy) external onlyOwner {
        require(newStrategy != address(0), "Invalid address");
        yieldStrategy = IEmpowerToursYieldStrategyV9(newStrategy);
    }

    function withdrawEth() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // ============================================
    // Internal Helpers
    // ============================================

    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    // ============================================
    // Overrides
    // ============================================

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
