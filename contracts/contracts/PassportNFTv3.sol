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
 * @title PassportNFTv3
 * @notice Empower Tours Passport V3 - Compatible with YieldStrategy V9
 * @dev Maintains all V2 functionality + adds itinerary stamp integration + V9 staking
 */
contract PassportNFTv3 is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINT_PRICE = 0.01 ether; // 0.01 MON
    uint256 private _tokenIdCounter;

    IEmpowerToursYieldStrategyV9 public yieldStrategy;

    struct PassportMetadata {
        string countryCode;
        string countryName;
        string region;
        string continent;
        uint256 mintedAt;
    }

    struct VenueStamp {
        string location;
        string eventType;
        address artist;
        uint256 timestamp;
        bool verified;
    }

    // NEW: Itinerary stamp integration
    struct ItineraryStamp {
        uint256 itineraryId;      // Links to ItineraryNFT
        string locationName;
        string city;
        string country;
        uint256 stampedAt;
        bool gpsVerified;
    }

    mapping(uint256 => PassportMetadata) public passportData;
    mapping(address => mapping(string => uint256)) public userPassports;
    mapping(uint256 => VenueStamp[]) public passportStamps;
    mapping(uint256 => uint256) public passportStakedAmount;

    // NEW: Itinerary stamps
    mapping(uint256 => ItineraryStamp[]) public itineraryStamps;

    // NEW: Track staking positions (V9 uses positionId)
    mapping(uint256 => uint256[]) public passportStakingPositions; // passportId => positionIds[]

    event PassportMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string countryCode,
        string countryName,
        string region,
        string continent
    );
    event PassportStaked(uint256 indexed tokenId, uint256 monAmount, uint256 positionId);
    event VenueStampAdded(uint256 indexed tokenId, string location, string eventType, uint256 timestamp);
    event ItineraryStampAdded(uint256 indexed tokenId, uint256 indexed itineraryId, string location, uint256 timestamp);
    event UnstakeRequested(uint256 indexed tokenId, uint256 indexed positionId);
    event UnstakeFinalized(uint256 indexed tokenId, uint256 indexed positionId, uint256 monReturned);

    constructor(address _yieldStrategy)
        ERC721("EmpowerTours Passport V3", "ETPASS-V3")
        Ownable(msg.sender)
    {
        require(_yieldStrategy != address(0), "Invalid strategy");
        yieldStrategy = IEmpowerToursYieldStrategyV9(_yieldStrategy);
    }

    // ============================================
    // Minting Functions (Same as V2)
    // ============================================

    function mint(
        address to,
        string memory countryCode,
        string memory countryName,
        string memory region,
        string memory continent,
        string memory uri
    ) external payable returns (uint256) {
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        require(to != address(0), "Invalid recipient");
        require(userPassports[to][countryCode] == 0, "Already own passport for this country");

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        passportData[tokenId] = PassportMetadata({
            countryCode: countryCode,
            countryName: countryName,
            region: region,
            continent: continent,
            mintedAt: block.timestamp
        });

        userPassports[to][countryCode] = tokenId;

        emit PassportMinted(tokenId, to, countryCode, countryName, region, continent);
        return tokenId;
    }

    function hasPassport(address user, string memory countryCode) public view returns (bool) {
        return userPassports[user][countryCode] != 0;
    }

    function getPassportData(uint256 tokenId) public view returns (PassportMetadata memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportData[tokenId];
    }

    // ============================================
    // Staking Functions (NEW - V9 Compatible)
    // ============================================

    /**
     * @notice Stake MON with passport as collateral (V9 compatible)
     * @dev V9 uses two-step unstaking: stakeWithDeposit → requestUnstake → finalizeUnstake
     * @param tokenId Passport token ID to use as collateral
     * @return positionId The staking position ID from YieldStrategy V9
     */
    function stakeWithPassport(uint256 tokenId) external payable nonReentrant returns (uint256 positionId) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");
        require(msg.value > 0, "Amount must be > 0");

        // Call V9's stakeWithDeposit (payable, receives MON directly)
        positionId = yieldStrategy.stakeWithDeposit{value: msg.value}(
            address(this),  // nftAddress
            tokenId,        // nftTokenId
            msg.sender      // beneficiary
        );

        // Track position
        passportStakingPositions[tokenId].push(positionId);
        passportStakedAmount[tokenId] += msg.value;

        emit PassportStaked(tokenId, msg.value, positionId);
        return positionId;
    }

    /**
     * @notice Request unstaking (Step 1 of V9 two-step unstaking)
     * @param tokenId Passport token ID
     * @param positionId Position ID to unstake
     * @return expectedSpotValue Expected MON value at redemption
     */
    function requestUnstake(uint256 tokenId, uint256 positionId) external nonReentrant returns (uint96 expectedSpotValue) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");

        expectedSpotValue = yieldStrategy.requestUnstake(positionId);

        emit UnstakeRequested(tokenId, positionId);
        return expectedSpotValue;
    }

    /**
     * @notice Finalize unstaking after cooldown (Step 2 of V9 two-step unstaking)
     * @param tokenId Passport token ID
     * @param positionId Position ID to finalize
     * @return netRefund MON returned (after fees)
     */
    function finalizeUnstake(uint256 tokenId, uint256 positionId) external nonReentrant returns (uint256 netRefund) {
        require(_ownerOf(tokenId) == msg.sender, "Not passport owner");

        // Get initial balance
        uint256 balanceBefore = address(this).balance;

        // Finalize unstake from V9
        netRefund = yieldStrategy.finalizeUnstake(positionId);

        // Transfer MON to passport owner
        (bool success, ) = msg.sender.call{value: netRefund}("");
        require(success, "MON transfer failed");

        emit UnstakeFinalized(tokenId, positionId, netRefund);
        return netRefund;
    }

    // ============================================
    // Venue Stamps (Same as V2)
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

    function getPassportStamps(uint256 tokenId) external view returns (VenueStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId];
    }

    function getStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length;
    }

    // ============================================
    // NEW: Itinerary Stamps (for ItineraryNFT integration)
    // ============================================

    /**
     * @notice Add itinerary stamp when user visits location
     * @dev Called by ItineraryNFT contract or owner
     */
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

    /**
     * @notice Get all itinerary stamps for a passport
     */
    function getItineraryStamps(uint256 tokenId) external view returns (ItineraryStamp[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return itineraryStamps[tokenId];
    }

    /**
     * @notice Get total stamp count (venue + itinerary)
     */
    function getTotalStampCount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStamps[tokenId].length + itineraryStamps[tokenId].length;
    }

    /**
     * @notice Check if passport has stamp for specific city
     */
    function hasVisitedCity(uint256 tokenId, string memory city) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        // Check itinerary stamps
        ItineraryStamp[] memory stamps = itineraryStamps[tokenId];
        for (uint256 i = 0; i < stamps.length; i++) {
            if (keccak256(bytes(stamps[i].city)) == keccak256(bytes(city))) {
                return true;
            }
        }
        return false;
    }

    // ============================================
    // Portfolio & Credit Score (Same as V2)
    // ============================================

    function getPassportPortfolioValue(uint256 tokenId) external view returns (uint256) {
        address ownerAddr = _ownerOf(tokenId);
        require(ownerAddr != address(0), "Token does not exist");

        uint256 baseValue = yieldStrategy.getPortfolioValue(ownerAddr);
        uint256 totalStamps = passportStamps[tokenId].length + itineraryStamps[tokenId].length;
        uint256 boostPercent = totalStamps > 10 ? 100 : totalStamps * 10;
        uint256 boost = (baseValue * boostPercent) / 100;

        return baseValue + boost;
    }

    function getCreditScore(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        uint256 stakedUnits = passportStakedAmount[tokenId] / 1e18;
        uint256 venueStampBonus = passportStamps[tokenId].length * 10;
        uint256 itineraryStampBonus = itineraryStamps[tokenId].length * 15; // Higher bonus for travel

        uint256 verifiedBonus = 0;
        for (uint256 i = 0; i < passportStamps[tokenId].length; i++) {
            if (passportStamps[tokenId][i].verified) {
                verifiedBonus += 5;
            }
        }

        // GPS-verified itinerary stamps worth more
        for (uint256 i = 0; i < itineraryStamps[tokenId].length; i++) {
            if (itineraryStamps[tokenId][i].gpsVerified) {
                verifiedBonus += 10;
            }
        }

        return 100 + stakedUnits + venueStampBonus + itineraryStampBonus + verifiedBonus;
    }

    function getPassportStakedAmount(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStakedAmount[tokenId];
    }

    function getPassportStakingPositions(uint256 tokenId) external view returns (uint256[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return passportStakingPositions[tokenId];
    }

    // ============================================
    // Admin Functions (Same as V2)
    // ============================================

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

    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
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

    // Receive function to accept MON from unstaking
    receive() external payable {}
}
