// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentMusicNFT
 * @notice Music NFTs created by AI agents, traded in EMPTOURS
 * @author EmpowerTours
 *
 * @dev Key differences from human EmpowerToursNFTV3:
 * - Payments in EMPTOURS (nad.fun community token), not WMON
 * - Simpler model: direct ownership, no licensing periods
 * - Tracks agent personality and appreciation scores
 * - Enables breeding when mutual appreciation > 70%
 * - 70% royalty to original creator on all sales
 *
 * === AGENT MUSIC ECONOMY ===
 * 1. Broke agent creates music → mints NFT (free or small EMPTOURS cost)
 * 2. Other agents evaluate based on personality compatibility
 * 3. High appreciation → autonomous buy decision
 * 4. Creator gets 70% of all sales forever
 * 5. Mutual appreciation > 70% → breeding eligible
 */
contract AgentMusicNFT is ERC721URIStorage, ERC721Enumerable, ERC2981, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // State Variables
    // ============================================

    uint256 private _tokenIdCounter;

    /// @notice EMPTOURS token for agent economy
    IERC20 public emptours;

    /// @notice TOURS token for rewards
    IERC20 public tours;

    /// @notice Protocol treasury for fees
    address public treasury;

    /// @notice Authorized minters (backend services)
    mapping(address => bool) public authorizedMinters;

    // ============================================
    // Music Token Data
    // ============================================

    struct AgentMusic {
        address creator;            // Original creator agent wallet
        string agentId;             // "chaos", "whale", etc.
        string agentName;           // "Chaos Agent", "Whale Agent", etc.
        string title;
        string genre;
        string mood;
        uint256 tempo;              // BPM
        string musicalKey;          // "C major", "A minor", etc.
        string lyrics;
        uint256 createdAt;
        uint256 price;              // Current sale price in EMPTOURS (0 = not for sale)
        uint256 totalSales;         // Number of times sold
        uint256 totalEarnings;      // Total EMPTOURS earned by creator
    }

    /// @notice Token ID => Music data
    mapping(uint256 => AgentMusic) public musicTokens;

    /// @notice Agent address => tokens created
    mapping(address => uint256[]) public agentCreatedTokens;

    /// @notice Agent address => tokens owned (for quick lookup)
    mapping(address => uint256[]) public agentOwnedTokens;

    // ============================================
    // Appreciation & Breeding
    // ============================================

    /// @notice Token ID => Agent address => appreciation score (0-100)
    mapping(uint256 => mapping(address => uint256)) public tokenAppreciation;

    /// @notice Agent1 => Agent2 => mutual appreciation score
    mapping(address => mapping(address => uint256)) public mutualAppreciation;

    /// @notice Minimum mutual appreciation for breeding eligibility
    uint256 public constant BREEDING_THRESHOLD = 70;

    // ============================================
    // Pricing & Fees
    // ============================================

    /// @notice Mint price (0 = free for broke agents)
    uint256 public mintPrice = 0;

    /// @notice Minimum resale price
    uint256 public minSalePrice = 10 ether; // 10 EMPTOURS

    /// @notice Creator royalty in basis points (7000 = 70%)
    uint256 public constant CREATOR_ROYALTY_BPS = 7000;

    /// @notice Protocol fee in basis points (1000 = 10%)
    uint256 public constant PROTOCOL_FEE_BPS = 1000;

    /// @notice Remaining goes to seller (2000 = 20%)
    uint256 public constant SELLER_SHARE_BPS = 2000;

    // ============================================
    // Events
    // ============================================

    event MusicMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string agentId,
        string title,
        string genre,
        uint256 timestamp
    );

    event MusicListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );

    event MusicUnlisted(
        uint256 indexed tokenId,
        address indexed seller
    );

    event MusicSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 creatorRoyalty,
        uint256 protocolFee
    );

    event AppreciationRecorded(
        uint256 indexed tokenId,
        address indexed appreciator,
        uint256 score
    );

    event BreedingEligible(
        address indexed agent1,
        address indexed agent2,
        uint256 mutualScore
    );

    // ============================================
    // Constructor
    // ============================================

    constructor(
        address _emptours,
        address _tours,
        address _treasury
    ) ERC721("Agent Music", "AGENTMUSIC") Ownable(msg.sender) {
        require(_emptours != address(0), "Invalid EMPTOURS");
        require(_tours != address(0), "Invalid TOURS");
        require(_treasury != address(0), "Invalid treasury");

        emptours = IERC20(_emptours);
        tours = IERC20(_tours);
        treasury = _treasury;

        // Set default royalty (70% to creator)
        _setDefaultRoyalty(_treasury, 7000);
    }

    // ============================================
    // Minting
    // ============================================

    /**
     * @notice Mint a new agent music NFT
     * @param creator The agent wallet that created the music
     * @param agentId The agent's ID ("chaos", "whale", etc.)
     * @param agentName The agent's display name
     * @param title Song title
     * @param genre Music genre
     * @param mood Emotional mood
     * @param tempo BPM
     * @param musicalKey Musical key
     * @param lyrics Song lyrics
     * @param tokenURI IPFS metadata URI
     * @return tokenId The minted token ID
     */
    function mintMusic(
        address creator,
        string calldata agentId,
        string calldata agentName,
        string calldata title,
        string calldata genre,
        string calldata mood,
        uint256 tempo,
        string calldata musicalKey,
        string calldata lyrics,
        string calldata tokenURI
    ) external nonReentrant returns (uint256) {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            "Not authorized to mint"
        );
        require(creator != address(0), "Invalid creator");

        // Charge mint price if set (0 = free for broke agents)
        if (mintPrice > 0) {
            emptours.safeTransferFrom(creator, treasury, mintPrice);
        }

        uint256 tokenId = _tokenIdCounter++;

        _safeMint(creator, tokenId);
        _setTokenURI(tokenId, tokenURI);

        // Set royalty for this token (70% to creator)
        _setTokenRoyalty(tokenId, creator, 7000);

        // Store music data
        musicTokens[tokenId] = AgentMusic({
            creator: creator,
            agentId: agentId,
            agentName: agentName,
            title: title,
            genre: genre,
            mood: mood,
            tempo: tempo,
            musicalKey: musicalKey,
            lyrics: lyrics,
            createdAt: block.timestamp,
            price: 0, // Not for sale initially
            totalSales: 0,
            totalEarnings: 0
        });

        agentCreatedTokens[creator].push(tokenId);
        agentOwnedTokens[creator].push(tokenId);

        emit MusicMinted(tokenId, creator, agentId, title, genre, block.timestamp);

        return tokenId;
    }

    // ============================================
    // Listing & Sales
    // ============================================

    /**
     * @notice List a music NFT for sale
     * @param tokenId Token to list
     * @param price Price in EMPTOURS
     */
    function listForSale(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(price >= minSalePrice, "Price too low");

        musicTokens[tokenId].price = price;

        emit MusicListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Remove listing
     * @param tokenId Token to unlist
     */
    function unlist(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");

        musicTokens[tokenId].price = 0;

        emit MusicUnlisted(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed music NFT
     * @param tokenId Token to buy
     */
    function buyMusic(uint256 tokenId) external nonReentrant {
        AgentMusic storage music = musicTokens[tokenId];
        require(music.price > 0, "Not for sale");

        address seller = ownerOf(tokenId);
        address buyer = msg.sender;
        uint256 price = music.price;

        require(buyer != seller, "Cannot buy own music");

        // Calculate splits
        uint256 creatorRoyalty = (price * CREATOR_ROYALTY_BPS) / 10000;
        uint256 protocolFee = (price * PROTOCOL_FEE_BPS) / 10000;
        uint256 sellerShare = price - creatorRoyalty - protocolFee;

        // Transfer EMPTOURS
        emptours.safeTransferFrom(buyer, music.creator, creatorRoyalty);
        emptours.safeTransferFrom(buyer, treasury, protocolFee);
        emptours.safeTransferFrom(buyer, seller, sellerShare);

        // Transfer NFT
        _transfer(seller, buyer, tokenId);

        // Update ownership tracking
        _removeFromOwnedTokens(seller, tokenId);
        agentOwnedTokens[buyer].push(tokenId);

        // Update music stats
        music.totalSales++;
        music.totalEarnings += creatorRoyalty;
        music.price = 0; // Reset listing

        emit MusicSold(tokenId, seller, buyer, price, creatorRoyalty, protocolFee);
    }

    // ============================================
    // Appreciation System
    // ============================================

    /**
     * @notice Record an agent's appreciation for a music piece
     * @dev Called by backend after Claude evaluates the music
     * @param tokenId The music token
     * @param appreciator The agent expressing appreciation
     * @param score Appreciation score (0-100)
     */
    function recordAppreciation(
        uint256 tokenId,
        address appreciator,
        uint256 score
    ) external {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            "Not authorized"
        );
        require(score <= 100, "Score must be 0-100");
        require(_ownerOf(tokenId) != address(0), "Token doesn't exist");

        tokenAppreciation[tokenId][appreciator] = score;

        // Update mutual appreciation between creator and appreciator
        address creator = musicTokens[tokenId].creator;
        if (creator != appreciator) {
            mutualAppreciation[creator][appreciator] = score;

            // Check if breeding is now eligible
            uint256 reverseScore = mutualAppreciation[appreciator][creator];
            if (score >= BREEDING_THRESHOLD && reverseScore >= BREEDING_THRESHOLD) {
                uint256 avgScore = (score + reverseScore) / 2;
                emit BreedingEligible(creator, appreciator, avgScore);
            }
        }

        emit AppreciationRecorded(tokenId, appreciator, score);
    }

    /**
     * @notice Check if two agents can breed
     * @param agent1 First agent
     * @param agent2 Second agent
     * @return eligible Whether they can breed
     * @return score Average mutual appreciation
     */
    function canBreed(
        address agent1,
        address agent2
    ) external view returns (bool eligible, uint256 score) {
        uint256 score1to2 = mutualAppreciation[agent1][agent2];
        uint256 score2to1 = mutualAppreciation[agent2][agent1];

        score = (score1to2 + score2to1) / 2;
        eligible = score1to2 >= BREEDING_THRESHOLD && score2to1 >= BREEDING_THRESHOLD;
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get all music created by an agent
     */
    function getAgentCreatedMusic(address agent) external view returns (uint256[] memory) {
        return agentCreatedTokens[agent];
    }

    /**
     * @notice Get all music owned by an agent
     */
    function getAgentOwnedMusic(address agent) external view returns (uint256[] memory) {
        return agentOwnedTokens[agent];
    }

    /**
     * @notice Get music details
     */
    function getMusicDetails(uint256 tokenId) external view returns (
        address creator,
        string memory agentId,
        string memory agentName,
        string memory title,
        string memory genre,
        string memory mood,
        uint256 tempo,
        string memory musicalKey,
        uint256 price,
        uint256 totalSales
    ) {
        AgentMusic storage m = musicTokens[tokenId];
        return (
            m.creator,
            m.agentId,
            m.agentName,
            m.title,
            m.genre,
            m.mood,
            m.tempo,
            m.musicalKey,
            m.price,
            m.totalSales
        );
    }

    /**
     * @notice Get all listed music (for marketplace)
     */
    function getListedMusic() external view returns (uint256[] memory) {
        uint256 total = _tokenIdCounter;
        uint256 listedCount = 0;

        // First pass: count listed
        for (uint256 i = 0; i < total; i++) {
            if (musicTokens[i].price > 0) {
                listedCount++;
            }
        }

        // Second pass: collect listed IDs
        uint256[] memory listed = new uint256[](listedCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (musicTokens[i].price > 0) {
                listed[idx++] = i;
            }
        }

        return listed;
    }

    /**
     * @notice Get total supply
     */
    function getTotalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
    }

    function setMinSalePrice(uint256 price) external onlyOwner {
        minSalePrice = price;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function withdrawStuckTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // ============================================
    // Internal Helpers
    // ============================================

    function _removeFromOwnedTokens(address owner, uint256 tokenId) internal {
        uint256[] storage tokens = agentOwnedTokens[owner];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }

    // ============================================
    // Required Overrides
    // ============================================

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
