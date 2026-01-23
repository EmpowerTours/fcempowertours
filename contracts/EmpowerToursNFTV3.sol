// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EmpowerToursNFTV3
 * @notice Unified NFT contract for music and art with:
 * - ERC2981 royalty support (50% for both music and art)
 * - Soulbound masters (cannot be transferred by artists)
 * - Users buy/resell licenses (for both music and art)
 * - Collector editions with unique AI-generated artwork
 * - Delegated sales with automatic royalty distribution
 * - Tiered burn rewards with safeguards
 * - WMON for payments, TOURS for rewards
 * - Minimum pricing enforcement (35 WMON standard, 500 WMON collector)
 * - DAO Timelock governance for burning stolen/infringing content
 * - Authorized minter system for delegated minting via User Safes
 *
 * @dev V3 Changes from V2:
 * - Added authorizedMinters mapping for secure delegated minting
 * - Added onlyAuthorizedMinter modifier to mintMaster/mintCollectorMaster
 * - Added registerUserSafeAsMinter for platform operator
 * - Added master existence check in renewLicense
 */
contract EmpowerToursNFTV3 is ERC721URIStorage, ERC2981, Ownable, ReentrancyGuard {
    uint256 private _masterTokenCounter;
    uint256 private _licenseTokenCounter = 1000000;

    IERC20 public wmonToken;  // For payments (license purchases, sales)
    IERC20 public toursToken; // For rewards (staking, burning)

    // ============================================
    // Minimum Pricing (Platform Protection)
    // ============================================
    uint256 public constant MINIMUM_LICENSE_PRICE = 35 ether;      // 35 WMON (~$1.23, 5% cheaper than iTunes)
    uint256 public constant MINIMUM_COLLECTOR_PRICE = 500 ether;   // 500 WMON (~$17.50, premium pricing)

    // ============================================
    // NFT Type Support
    // ============================================
    enum NFTType { MUSIC, ART }

    struct MasterToken {
        uint256 artistFid;      // Artist's Farcaster ID
        address originalArtist; // Never changes, receives royalties forever
        string tokenURI;
        string collectorTokenURI; // AI-enhanced version for collector editions
        uint256 price;
        uint256 collectorPrice;
        uint256 totalSold;
        uint256 activeLicenses; // Count of active licenses (prevents master burn)
        uint256 maxCollectorEditions; // Max collector editions (0 = unlimited standard)
        uint256 collectorsMinted; // Collector editions minted so far
        bool active;
        NFTType nftType;
        uint96 royaltyPercentage; // Basis points (500 = 5%, 750 = 7.5%)
    }

    struct License {
        uint256 masterTokenId;
        uint256 licenseeFid;    // Licensee's Farcaster ID
        address licensee;
        uint256 expiry;
        bool active;
        bool isCollectorEdition;
    }

    // ============================================
    // Staking State
    // ============================================
    struct StakingInfo {
        address staker;
        uint256 stakedAt;
        uint256 lastClaimAt;
        bool isStaked;
    }

    mapping(uint256 => StakingInfo) public stakingInfo;
    mapping(address => uint256[]) public userStakedTokens;
    mapping(uint256 => uint256) public stakedTokenIndex;

    uint256 public totalStaked;
    uint256 public stakingRewardRate = 1 ether; // 1 TOURS per day per staked NFT
    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============================================
    // Burning State - Tiered Rewards
    // ============================================
    uint256 public masterBurnReward = 10 ether;      // 10 TOURS for burning master (highest)
    uint256 public activeLicenseBurnReward = 5 ether; // 5 TOURS for active license
    uint256 public expiredLicenseBurnReward = 1 ether; // 1 TOURS for expired license
    uint256 public totalBurned;

    // ============================================
    // Authorization State
    // ============================================
    mapping(address => bool) public authorizedBurners;
    mapping(address => bool) public authorizedMinters;  // V3: For delegated minting via User Safes
    address public platformOperator; // Can register User Safes as burners/minters
    address public daoTimelock; // DAO Timelock that can execute governance actions (burn stolen content)

    mapping(uint256 => MasterToken) public masterTokens;
    mapping(uint256 => License) public licenses;
    mapping(address => uint256[]) public userLicenses;
    mapping(uint256 => uint256[]) public fidLicenses;        // FID => license IDs
    mapping(uint256 => uint256[]) public artistFidMasters;   // FID => master token IDs
    mapping(address => mapping(string => bool)) public artistSongs;
    mapping(uint256 => string) public masterTitles; // tokenId => title (for cleanup on burn)

    address public treasury;
    uint256 public licensePeriod = 30 days;
    uint256 public treasuryFee = 10; // 10%

    // Royalty basis points (10000 = 100%)
    uint96 public constant MUSIC_ROYALTY = 5000;  // 50%
    uint96 public constant ART_ROYALTY = 5000;    // 50%

    // ============================================
    // Events
    // ============================================
    event MasterMinted(uint256 indexed tokenId, address indexed artist, uint256 indexed artistFid, string tokenURI, uint256 price, NFTType nftType, uint96 royalty);
    event CollectorMasterMinted(uint256 indexed tokenId, address indexed artist, uint256 indexed artistFid, uint256 maxEditions, uint256 collectorPrice);
    event LicensePurchased(uint256 indexed licenseId, uint256 indexed masterTokenId, uint256 indexed licenseeFid, address buyer, uint256 expiry, bool isCollector);
    event LicenseExpired(uint256 indexed licenseId);
    event PriceUpdated(uint256 indexed masterTokenId, uint256 newPrice);
    event RoyaltyPaid(uint256 indexed masterTokenId, address indexed artist, uint256 amount);
    event NFTStaked(uint256 indexed tokenId, address indexed staker, uint256 timestamp);
    event NFTUnstaked(uint256 indexed tokenId, address indexed staker, uint256 rewardsClaimed, uint256 timestamp);
    event RewardsClaimed(uint256 indexed tokenId, address indexed staker, uint256 amount, uint256 timestamp);
    event NFTBurned(uint256 indexed tokenId, address indexed burner, uint256 rewardReceived, uint256 timestamp, string burnType);
    event BurnRewardUpdated(string rewardType, uint256 newReward, uint256 timestamp);
    event RewardRateUpdated(uint256 newRate, uint256 timestamp);
    event PlatformOperatorUpdated(address indexed operator);
    event UserSafeRegisteredAsBurner(address indexed userSafe);
    event UserSafeRegisteredAsMinter(address indexed userSafe);  // V3: New event
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);  // V3: New event
    event LicenseSold(
        uint256 indexed licenseId,
        uint256 indexed masterTokenId,
        address indexed seller,
        address buyer,
        uint256 salePrice,
        uint256 royaltyPaid,
        address royaltyRecipient
    );
    event StolenContentBurned(uint256 indexed tokenId, address indexed originalOwner, string reason, uint256 timestamp);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);

    // ============================================
    // Modifiers
    // ============================================

    /**
     * @notice V3: Restricts minting to authorized minters (User Safes, Platform Safe, or owner)
     * @dev User Safes are registered by platformOperator for delegated minting
     */
    modifier onlyAuthorizedMinter() {
        require(
            authorizedMinters[msg.sender] || msg.sender == owner(),
            "Not authorized to mint"
        );
        _;
    }

    constructor(
        address _treasury,
        address _wmonToken,
        address _toursToken
    ) ERC721("EmpowerTours NFT V3", "ETNFT3") Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_wmonToken != address(0), "Invalid WMON token");
        require(_toursToken != address(0), "Invalid TOURS token");
        treasury = _treasury;
        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
    }

    // ============================================
    // Master Minting (Soulbound to Artist)
    // ============================================

    /**
     * @notice Mint a new master NFT (soulbound to artist)
     * @dev V3: Only authorized minters (User Safes, Platform Safe, owner) can call
     * @param artist The artist's wallet address (receives royalties)
     * @param artistFid The artist's Farcaster ID
     * @param tokenURI IPFS URI for the NFT metadata
     * @param title Unique title for the NFT (prevents duplicates per artist)
     * @param price License price in WMON (minimum 35 WMON)
     * @param nftType MUSIC or ART
     */
    function mintMaster(
        address artist,
        uint256 artistFid,
        string memory tokenURI,
        string memory title,
        uint256 price,
        NFTType nftType
    ) external onlyAuthorizedMinter returns (uint256) {
        require(!artistSongs[artist][title], "NFT already minted");
        require(artistFid > 0, "Invalid FID");
        require(price >= MINIMUM_LICENSE_PRICE, "Price below minimum");

        _masterTokenCounter++;
        uint256 masterTokenId = _masterTokenCounter;

        _safeMint(artist, masterTokenId);
        _setTokenURI(masterTokenId, tokenURI);

        uint96 royalty = nftType == NFTType.MUSIC ? MUSIC_ROYALTY : ART_ROYALTY;

        masterTokens[masterTokenId] = MasterToken({
            artistFid: artistFid,
            originalArtist: artist,
            tokenURI: tokenURI,
            collectorTokenURI: "",
            price: price,
            collectorPrice: 0,
            totalSold: 0,
            activeLicenses: 0,
            maxCollectorEditions: 0,
            collectorsMinted: 0,
            active: true,
            nftType: nftType,
            royaltyPercentage: royalty
        });

        _setTokenRoyalty(masterTokenId, artist, royalty);
        artistSongs[artist][title] = true;
        masterTitles[masterTokenId] = title;
        artistFidMasters[artistFid].push(masterTokenId);

        emit MasterMinted(masterTokenId, artist, artistFid, tokenURI, price, nftType, royalty);
        return masterTokenId;
    }

    /**
     * @notice Mint a collector master NFT with limited editions
     * @dev V3: Only authorized minters can call. Creates master with collector edition support
     */
    function mintCollectorMaster(
        address artist,
        uint256 artistFid,
        string memory tokenURI,
        string memory collectorTokenURI,
        string memory title,
        uint256 standardPrice,
        uint256 collectorPrice,
        uint256 maxCollectorEditions,
        NFTType nftType
    ) external onlyAuthorizedMinter returns (uint256) {
        require(!artistSongs[artist][title], "NFT already minted");
        require(artistFid > 0, "Invalid FID");
        require(standardPrice >= MINIMUM_LICENSE_PRICE, "Standard price too low");
        require(collectorPrice >= MINIMUM_COLLECTOR_PRICE, "Collector price too low");
        require(maxCollectorEditions > 0 && maxCollectorEditions <= 1000, "Invalid edition count");

        _masterTokenCounter++;
        uint256 masterTokenId = _masterTokenCounter;

        _safeMint(artist, masterTokenId);
        _setTokenURI(masterTokenId, tokenURI);

        uint96 royalty = nftType == NFTType.MUSIC ? MUSIC_ROYALTY : ART_ROYALTY;

        masterTokens[masterTokenId] = MasterToken({
            artistFid: artistFid,
            originalArtist: artist,
            tokenURI: tokenURI,
            collectorTokenURI: collectorTokenURI,
            price: standardPrice,
            collectorPrice: collectorPrice,
            totalSold: 0,
            activeLicenses: 0,
            maxCollectorEditions: maxCollectorEditions,
            collectorsMinted: 0,
            active: true,
            nftType: nftType,
            royaltyPercentage: royalty
        });

        _setTokenRoyalty(masterTokenId, artist, royalty);
        artistSongs[artist][title] = true;
        masterTitles[masterTokenId] = title;
        artistFidMasters[artistFid].push(masterTokenId);

        emit MasterMinted(masterTokenId, artist, artistFid, tokenURI, standardPrice, nftType, royalty);
        emit CollectorMasterMinted(masterTokenId, artist, artistFid, maxCollectorEditions, collectorPrice);
        return masterTokenId;
    }

    // ============================================
    // License Purchase
    // ============================================

    function purchaseLicenseFor(uint256 masterTokenId, address licensee, uint256 licenseeFid) public nonReentrant {
        _purchaseLicenseFor(masterTokenId, licensee, licenseeFid, false);
    }

    function purchaseCollectorEditionFor(uint256 masterTokenId, address licensee, uint256 licenseeFid) public nonReentrant {
        MasterToken storage master = masterTokens[masterTokenId];
        require(master.maxCollectorEditions > 0, "No collector editions available");
        require(master.collectorsMinted < master.maxCollectorEditions, "Collector editions sold out");

        _purchaseLicenseFor(masterTokenId, licensee, licenseeFid, true);
        master.collectorsMinted++;
    }

    function _purchaseLicenseFor(uint256 masterTokenId, address licensee, uint256 licenseeFid, bool isCollector) internal {
        require(licensee != address(0), "Invalid licensee address");
        require(licenseeFid > 0, "Invalid FID");
        MasterToken storage master = masterTokens[masterTokenId];
        require(master.originalArtist != address(0), "Master doesn't exist");
        require(master.active, "Sales paused");

        uint256 price = isCollector ? master.collectorPrice : master.price;
        uint256 treasuryAmount = (price * treasuryFee) / 100;
        uint256 artistAmount = price - treasuryAmount;

        require(
            wmonToken.transferFrom(msg.sender, master.originalArtist, artistAmount),
            "Artist payment failed"
        );
        require(
            wmonToken.transferFrom(msg.sender, treasury, treasuryAmount),
            "Treasury payment failed"
        );

        _licenseTokenCounter++;
        uint256 licenseId = _licenseTokenCounter;

        _safeMint(licensee, licenseId);

        string memory uri = isCollector ? master.collectorTokenURI : master.tokenURI;
        _setTokenURI(licenseId, uri);
        _setTokenRoyalty(licenseId, master.originalArtist, master.royaltyPercentage);

        licenses[licenseId] = License({
            masterTokenId: masterTokenId,
            licenseeFid: licenseeFid,
            licensee: licensee,
            expiry: block.timestamp + licensePeriod,
            active: true,
            isCollectorEdition: isCollector
        });

        userLicenses[licensee].push(licenseId);
        fidLicenses[licenseeFid].push(licenseId);
        master.totalSold++;
        master.activeLicenses++;

        emit LicensePurchased(licenseId, masterTokenId, licenseeFid, licensee, licenses[licenseId].expiry, isCollector);
        emit RoyaltyPaid(masterTokenId, master.originalArtist, artistAmount);
    }

    function purchaseLicense(uint256 masterTokenId, uint256 licenseeFid) external {
        purchaseLicenseFor(masterTokenId, msg.sender, licenseeFid);
    }

    function purchaseCollectorEdition(uint256 masterTokenId, uint256 licenseeFid) external {
        purchaseCollectorEditionFor(masterTokenId, msg.sender, licenseeFid);
    }

    // ============================================
    // License Renewal
    // ============================================

    function renewLicense(uint256 licenseId) external nonReentrant {
        License storage license = licenses[licenseId];
        require(ownerOf(licenseId) == msg.sender, "Not license owner");

        uint256 masterTokenId = license.masterTokenId;
        MasterToken storage master = masterTokens[masterTokenId];
        require(master.originalArtist != address(0), "Master no longer exists"); // V3: Added check

        uint256 price = license.isCollectorEdition ? master.collectorPrice : master.price;
        uint256 treasuryAmount = (price * treasuryFee) / 100;
        uint256 artistAmount = price - treasuryAmount;

        require(
            wmonToken.transferFrom(msg.sender, master.originalArtist, artistAmount),
            "Artist payment failed"
        );
        require(
            wmonToken.transferFrom(msg.sender, treasury, treasuryAmount),
            "Treasury payment failed"
        );

        bool wasInactive = !license.active;
        license.expiry = block.timestamp + licensePeriod;
        license.active = true;

        if (wasInactive) {
            master.activeLicenses++;
        }
    }

    // ============================================
    // Delegated Sales
    // ============================================

    function executeSaleFor(
        address seller,
        address buyer,
        uint256 licenseId,
        uint256 salePrice
    ) external nonReentrant {
        require(buyer != address(0), "Invalid buyer");
        require(seller != address(0), "Invalid seller");
        require(ownerOf(licenseId) == seller, "Seller doesn't own license");

        License storage license = licenses[licenseId];
        require(license.active, "License not active");

        uint256 masterTokenId = license.masterTokenId;

        (address royaltyRecipient, uint256 royaltyAmount) = royaltyInfo(licenseId, salePrice);
        uint256 sellerPayment = salePrice - royaltyAmount;

        require(
            wmonToken.transferFrom(buyer, royaltyRecipient, royaltyAmount),
            "Royalty payment failed"
        );
        require(
            wmonToken.transferFrom(buyer, seller, sellerPayment),
            "Seller payment failed"
        );

        _transfer(seller, buyer, licenseId);
        license.licensee = buyer;

        emit LicenseSold(licenseId, masterTokenId, seller, buyer, salePrice, royaltyAmount, royaltyRecipient);
        emit RoyaltyPaid(masterTokenId, royaltyRecipient, royaltyAmount);
    }

    // ============================================
    // Price Management
    // ============================================

    function updatePrice(uint256 masterTokenId, uint256 newPrice) external {
        MasterToken storage master = masterTokens[masterTokenId];
        require(ownerOf(masterTokenId) == msg.sender, "Not the master owner");
        require(newPrice >= MINIMUM_LICENSE_PRICE, "Price below minimum");
        master.price = newPrice;
        emit PriceUpdated(masterTokenId, newPrice);
    }

    function updateCollectorPrice(uint256 masterTokenId, uint256 newPrice) external {
        MasterToken storage master = masterTokens[masterTokenId];
        require(ownerOf(masterTokenId) == msg.sender, "Not the master owner");
        require(newPrice >= MINIMUM_COLLECTOR_PRICE, "Price below minimum");
        master.collectorPrice = newPrice;
    }

    function toggleSales(uint256 masterTokenId) external {
        require(ownerOf(masterTokenId) == msg.sender, "Not the master owner");
        masterTokens[masterTokenId].active = !masterTokens[masterTokenId].active;
    }

    // ============================================
    // Burning with Tiered Rewards
    // ============================================

    function burnNFT(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!stakingInfo[tokenId].isStaked, "Cannot burn staked NFT");

        uint256 reward = _executeBurn(tokenId, msg.sender);

        if (reward > 0) {
            require(toursToken.transfer(msg.sender, reward), "Reward transfer failed");
        }
    }

    function burnNFTFor(address owner, uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == owner, "Incorrect owner");
        require(!stakingInfo[tokenId].isStaked, "Cannot burn staked NFT");

        require(
            msg.sender == owner ||
            isApprovedForAll(owner, msg.sender) ||
            getApproved(tokenId) == msg.sender,
            "Not authorized to burn"
        );

        uint256 reward = _executeBurn(tokenId, owner);

        if (reward > 0) {
            require(toursToken.transfer(owner, reward), "Reward transfer failed");
        }
    }

    function burnNFTForDelegated(address owner, uint256 tokenId) external nonReentrant {
        require(authorizedBurners[msg.sender], "Not authorized to burn");
        require(ownerOf(tokenId) == owner, "Incorrect owner");
        require(!stakingInfo[tokenId].isStaked, "Cannot burn staked NFT");

        uint256 reward = _executeBurn(tokenId, owner);

        if (reward > 0) {
            require(toursToken.transfer(owner, reward), "Reward transfer failed");
        }
    }

    function _executeBurn(uint256 tokenId, address owner) internal returns (uint256 reward) {
        string memory burnType;

        if (tokenId <= _masterTokenCounter && masterTokens[tokenId].originalArtist != address(0)) {
            MasterToken storage master = masterTokens[tokenId];
            require(master.activeLicenses == 0, "Cannot burn master with active licenses");

            reward = masterBurnReward;
            burnType = "MASTER";
            delete masterTokens[tokenId];
        } else if (licenses[tokenId].masterTokenId != 0) {
            License storage license = licenses[tokenId];
            uint256 masterTokenId = license.masterTokenId;
            MasterToken storage master = masterTokens[masterTokenId];

            if (license.active && block.timestamp <= license.expiry) {
                reward = activeLicenseBurnReward;
                burnType = "ACTIVE_LICENSE";

                if (master.activeLicenses > 0) {
                    master.activeLicenses--;
                }
            } else {
                reward = expiredLicenseBurnReward;
                burnType = "EXPIRED_LICENSE";
            }

            license.active = false;
        } else {
            revert("Unknown token type");
        }

        _resetTokenRoyalty(tokenId);
        _burn(tokenId);
        delete stakingInfo[tokenId];
        totalBurned++;

        emit NFTBurned(tokenId, owner, reward, block.timestamp, burnType);

        return reward;
    }

    function burnExpiredLicense(uint256 licenseId) external nonReentrant {
        License storage license = licenses[licenseId];
        require(block.timestamp > license.expiry, "Not expired");
        require(license.active, "Already burned");

        address owner = ownerOf(licenseId);
        uint256 reward = expiredLicenseBurnReward;

        license.active = false;
        _resetTokenRoyalty(licenseId);
        _burn(licenseId);
        delete stakingInfo[licenseId];
        totalBurned++;

        if (reward > 0) {
            require(toursToken.transfer(owner, reward), "Reward transfer failed");
        }

        emit NFTBurned(licenseId, owner, reward, block.timestamp, "EXPIRED_LICENSE");
        emit LicenseExpired(licenseId);
    }

    // ============================================
    // Staking Functions
    // ============================================

    function stakeNFT(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!stakingInfo[tokenId].isStaked, "Already staked");

        stakingInfo[tokenId] = StakingInfo({
            staker: msg.sender,
            stakedAt: block.timestamp,
            lastClaimAt: block.timestamp,
            isStaked: true
        });

        userStakedTokens[msg.sender].push(tokenId);
        stakedTokenIndex[tokenId] = userStakedTokens[msg.sender].length - 1;
        totalStaked++;

        emit NFTStaked(tokenId, msg.sender, block.timestamp);
    }

    function unstakeNFT(uint256 tokenId) external nonReentrant {
        StakingInfo storage info = stakingInfo[tokenId];
        require(info.isStaked, "Not staked");
        require(info.staker == msg.sender, "Not staker");

        uint256 rewards = calculatePendingRewards(tokenId);
        if (rewards > 0) {
            require(toursToken.transfer(msg.sender, rewards), "Reward transfer failed");
        }

        uint256 index = stakedTokenIndex[tokenId];
        uint256 lastIndex = userStakedTokens[msg.sender].length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = userStakedTokens[msg.sender][lastIndex];
            userStakedTokens[msg.sender][index] = lastTokenId;
            stakedTokenIndex[lastTokenId] = index;
        }

        userStakedTokens[msg.sender].pop();
        delete stakedTokenIndex[tokenId];
        delete stakingInfo[tokenId];
        totalStaked--;

        emit NFTUnstaked(tokenId, msg.sender, rewards, block.timestamp);
    }

    function claimStakingRewards(uint256 tokenId) external nonReentrant {
        StakingInfo storage info = stakingInfo[tokenId];
        require(info.isStaked, "Not staked");
        require(info.staker == msg.sender, "Not staker");

        uint256 rewards = calculatePendingRewards(tokenId);
        require(rewards > 0, "No rewards to claim");

        info.lastClaimAt = block.timestamp;
        require(toursToken.transfer(msg.sender, rewards), "Reward transfer failed");

        emit RewardsClaimed(tokenId, msg.sender, rewards, block.timestamp);
    }

    function calculatePendingRewards(uint256 tokenId) public view returns (uint256) {
        StakingInfo memory info = stakingInfo[tokenId];
        if (!info.isStaked) return 0;

        uint256 timeStaked = block.timestamp - info.lastClaimAt;
        uint256 daysStaked = timeStaked / SECONDS_PER_DAY;

        return daysStaked * stakingRewardRate;
    }

    function getUserStakedTokens(address user) external view returns (uint256[] memory) {
        return userStakedTokens[user];
    }

    // ============================================
    // View Functions
    // ============================================

    function hasValidLicense(address user, uint256 masterTokenId) external view returns (bool) {
        uint256[] memory userLics = userLicenses[user];
        for (uint i = 0; i < userLics.length; i++) {
            License memory lic = licenses[userLics[i]];
            if (lic.masterTokenId == masterTokenId && lic.active && block.timestamp <= lic.expiry) {
                return true;
            }
        }
        return false;
    }

    function hasSong(address artist, string memory songTitle) external view returns (bool) {
        return artistSongs[artist][songTitle];
    }

    function getTotalMasters() external view returns (uint256) {
        return _masterTokenCounter;
    }

    function getMastersByType(NFTType nftType) external view returns (uint256[] memory) {
        uint256 count = 0;

        for (uint256 i = 1; i <= _masterTokenCounter; i++) {
            if (masterTokens[i].originalArtist != address(0) && masterTokens[i].nftType == nftType) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i <= _masterTokenCounter; i++) {
            if (masterTokens[i].originalArtist != address(0) && masterTokens[i].nftType == nftType) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }

    function getMasterType(uint256 tokenId) external view returns (NFTType) {
        require(masterTokens[tokenId].originalArtist != address(0), "Master doesn't exist");
        return masterTokens[tokenId].nftType;
    }

    function getArtistMastersByFid(uint256 artistFid) external view returns (uint256[] memory) {
        return artistFidMasters[artistFid];
    }

    function getLicensesByFid(uint256 fid) external view returns (uint256[] memory) {
        return fidLicenses[fid];
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setAuthorizedBurner(address burner, bool authorized) external onlyOwner {
        authorizedBurners[burner] = authorized;
    }

    /**
     * @notice V3: Set an authorized minter (owner only)
     * @param minter Address to authorize/deauthorize
     * @param authorized Whether the address can mint
     */
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    function setPlatformOperator(address operator) external onlyOwner {
        platformOperator = operator;
        emit PlatformOperatorUpdated(operator);
    }

    /**
     * @notice Platform operator can register User Safes as authorized burners
     */
    function registerUserSafeAsBurner(address userSafe) external {
        require(msg.sender == platformOperator, "Only platform operator");
        authorizedBurners[userSafe] = true;
        emit UserSafeRegisteredAsBurner(userSafe);
    }

    /**
     * @notice V3: Platform operator can register User Safes as authorized minters
     * @dev Called when a user wants to mint NFTs via their User Safe
     */
    function registerUserSafeAsMinter(address userSafe) external {
        require(msg.sender == platformOperator, "Only platform operator");
        authorizedMinters[userSafe] = true;
        emit UserSafeRegisteredAsMinter(userSafe);
    }

    function updateStakingRewardRate(uint256 newRate) external onlyOwner {
        stakingRewardRate = newRate;
        emit RewardRateUpdated(newRate, block.timestamp);
    }

    function updateMasterBurnReward(uint256 newReward) external onlyOwner {
        masterBurnReward = newReward;
        emit BurnRewardUpdated("MASTER", newReward, block.timestamp);
    }

    function updateActiveLicenseBurnReward(uint256 newReward) external onlyOwner {
        activeLicenseBurnReward = newReward;
        emit BurnRewardUpdated("ACTIVE_LICENSE", newReward, block.timestamp);
    }

    function updateExpiredLicenseBurnReward(uint256 newReward) external onlyOwner {
        expiredLicenseBurnReward = newReward;
        emit BurnRewardUpdated("EXPIRED_LICENSE", newReward, block.timestamp);
    }

    function withdrawTreasury(address to, uint256 amount) external onlyOwner {
        require(wmonToken.transfer(to, amount), "Transfer failed");
    }

    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    /**
     * @notice Admin or DAO function to burn stolen/infringing content without owner permission
     * @dev Burns any NFT (master or license) that contains stolen content
     * @dev Can be called by contract owner (admin) OR by DAO Timelock after successful governance vote
     * @param tokenId The token ID to burn
     * @param reason The reason for burning (e.g., "Copyright infringement", "Stolen content")
     */
    function burnStolenContent(uint256 tokenId, string memory reason) external nonReentrant {
        require(msg.sender == owner() || msg.sender == daoTimelock, "Only owner or DAO can burn stolen content");
        address originalOwner = ownerOf(tokenId);

        // Force unstake if staked
        if (stakingInfo[tokenId].isStaked) {
            address staker = stakingInfo[tokenId].staker;

            // Remove from staker's array
            uint256 index = stakedTokenIndex[tokenId];
            uint256 lastIndex = userStakedTokens[staker].length - 1;

            if (index != lastIndex) {
                uint256 lastTokenId = userStakedTokens[staker][lastIndex];
                userStakedTokens[staker][index] = lastTokenId;
                stakedTokenIndex[lastTokenId] = index;
            }

            userStakedTokens[staker].pop();
            delete stakedTokenIndex[tokenId];
            delete stakingInfo[tokenId];
            totalStaked--;
        }

        // Handle master token cleanup
        if (tokenId <= _masterTokenCounter && masterTokens[tokenId].originalArtist != address(0)) {
            MasterToken storage master = masterTokens[tokenId];

            // Clear artistSongs so the title can be reused by legitimate artist
            string memory title = masterTitles[tokenId];
            if (bytes(title).length > 0) {
                artistSongs[master.originalArtist][title] = false;
                delete masterTitles[tokenId];
            }

            delete masterTokens[tokenId];
        } else if (licenses[tokenId].masterTokenId != 0) {
            // Handle license cleanup
            License storage license = licenses[tokenId];
            uint256 masterTokenId = license.masterTokenId;
            MasterToken storage master = masterTokens[masterTokenId];

            if (license.active && master.activeLicenses > 0) {
                master.activeLicenses--;
            }

            license.active = false;
        }

        _resetTokenRoyalty(tokenId);
        _burn(tokenId);
        totalBurned++;

        emit StolenContentBurned(tokenId, originalOwner, reason, block.timestamp);
        emit NFTBurned(tokenId, originalOwner, 0, block.timestamp, "STOLEN_CONTENT");
    }

    // ============================================
    // Override to prevent master transfers
    // ============================================

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (to != address(0)) {
            require(!stakingInfo[tokenId].isStaked, "Cannot transfer staked NFT");
        }

        if (tokenId <= _masterTokenCounter && masterTokens[tokenId].originalArtist != address(0)) {
            require(from == address(0) || to == address(0), "Masters are soulbound and cannot be transferred");
        }

        return super._update(to, tokenId, auth);
    }

    // ============================================
    // ERC2981 & ERC165 Support
    // ============================================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
