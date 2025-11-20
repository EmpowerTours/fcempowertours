// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EmpowerToursNFTv6 is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _masterTokenCounter;
    uint256 private _licenseTokenCounter = 1000000;

    IERC20 public toursToken;

    // ============================================
    // NFT Type Support
    // ============================================
    enum NFTType { MUSIC, ART }

    struct MasterToken {
        address artist;
        string tokenURI;
        uint256 price;
        uint256 totalSold;
        bool active;
        NFTType nftType;
    }

    struct License {
        uint256 masterTokenId;
        address licensee;
        uint256 expiry;
        bool active;
    }

    // ============================================
    // ✅ NEW: Staking State
    // ============================================
    struct StakingInfo {
        address staker;
        uint256 stakedAt;
        uint256 lastClaimAt;
        bool isStaked;
    }

    mapping(uint256 => StakingInfo) public stakingInfo;
    mapping(address => uint256[]) public userStakedTokens;
    mapping(uint256 => uint256) public stakedTokenIndex; // tokenId => index in userStakedTokens

    uint256 public totalStaked;
    uint256 public stakingRewardRate = 1 ether; // 1 TOURS per day per staked NFT
    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============================================
    // ✅ NEW: Burning State
    // ============================================
    uint256 public burnRewardAmount = 5 ether; // 5 TOURS reward for burning
    uint256 public totalBurned;

    mapping(uint256 => MasterToken) public masterTokens;
    mapping(uint256 => License) public licenses;
    mapping(address => uint256[]) public userLicenses;
    mapping(address => mapping(string => bool)) public artistSongs;

    address public treasury;
    uint256 public licensePeriod = 30 days;
    uint256 public treasuryFee = 10; // 10% (using basis points: 10/100 = 0.1)

    // ============================================
    // Events (existing + new)
    // ============================================
    event MasterMinted(uint256 indexed tokenId, address indexed artist, string tokenURI, uint256 price, NFTType nftType);
    event LicensePurchased(uint256 indexed licenseId, uint256 indexed masterTokenId, address indexed buyer, uint256 expiry);
    event LicenseExpired(uint256 indexed licenseId);
    event PriceUpdated(uint256 indexed masterTokenId, uint256 newPrice);
    event RoyaltyPaid(uint256 indexed masterTokenId, address indexed artist, uint256 amount);

    // ✅ NEW: Staking Events
    event NFTStaked(uint256 indexed tokenId, address indexed staker, uint256 timestamp);
    event NFTUnstaked(uint256 indexed tokenId, address indexed staker, uint256 rewardsClaimed, uint256 timestamp);
    event RewardsClaimed(uint256 indexed tokenId, address indexed staker, uint256 amount, uint256 timestamp);

    // ✅ NEW: Burning Events
    event NFTBurned(uint256 indexed tokenId, address indexed burner, uint256 rewardReceived, uint256 timestamp);
    event BurnRewardUpdated(uint256 newReward, uint256 timestamp);
    event RewardRateUpdated(uint256 newRate, uint256 timestamp);

    constructor(address _treasury, address _toursToken) ERC721("EmpowerTours NFT", "ETNFT") Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_toursToken != address(0), "Invalid TOURS token");
        treasury = _treasury;
        toursToken = IERC20(_toursToken);
    }

    // ============================================
    // Existing V4 Functions (unchanged)
    // ============================================

    function mintMaster(
        address artist,
        string memory tokenURI,
        string memory title,
        uint256 price,
        NFTType nftType
    ) external returns (uint256) {
        require(!artistSongs[artist][title], "NFT already minted");

        _masterTokenCounter++;
        uint256 masterTokenId = _masterTokenCounter;

        _safeMint(artist, masterTokenId);
        _setTokenURI(masterTokenId, tokenURI);

        masterTokens[masterTokenId] = MasterToken({
            artist: artist,
            tokenURI: tokenURI,
            price: price,
            totalSold: 0,
            active: true,
            nftType: nftType
        });

        artistSongs[artist][title] = true;

        emit MasterMinted(masterTokenId, artist, tokenURI, price, nftType);
        return masterTokenId;
    }

    /**
     * @dev Purchase a license for another address (for delegation/gasless purchases)
     * @param masterTokenId The master NFT token ID
     * @param licensee The address that will own the license
     */
    function purchaseLicenseFor(uint256 masterTokenId, address licensee) public nonReentrant {
        require(licensee != address(0), "Invalid licensee address");
        MasterToken storage master = masterTokens[masterTokenId];
        require(master.artist != address(0), "Master doesn't exist");
        require(master.active, "Sales paused");

        uint256 price = master.price;

        // Calculate fees (10%)
        uint256 treasuryAmount = (price * treasuryFee) / 100;
        uint256 artistAmount = price - treasuryAmount;

        // Transfer payment from caller (could be Safe account)
        require(
            toursToken.transferFrom(msg.sender, master.artist, artistAmount),
            "Artist payment failed"
        );
        require(
            toursToken.transferFrom(msg.sender, treasury, treasuryAmount),
            "Treasury payment failed"
        );

        // Create license NFT
        _licenseTokenCounter++;
        uint256 licenseId = _licenseTokenCounter;

        _safeMint(licensee, licenseId); // ✅ Mint to licensee, not msg.sender
        _setTokenURI(licenseId, master.tokenURI);

        // Store license data
        licenses[licenseId] = License({
            masterTokenId: masterTokenId,
            licensee: licensee, // ✅ License owned by specified address
            expiry: block.timestamp + licensePeriod,
            active: true
        });

        userLicenses[licensee].push(licenseId);
        master.totalSold++;

        emit LicensePurchased(licenseId, masterTokenId, licensee, licenses[licenseId].expiry);
        emit RoyaltyPaid(masterTokenId, master.artist, artistAmount);
    }

    /**
     * @dev Purchase a license for yourself (backwards compatible)
     * @param masterTokenId The master NFT token ID
     */
    function purchaseLicense(uint256 masterTokenId) external {
        purchaseLicenseFor(masterTokenId, msg.sender);
    }

    function renewLicense(uint256 licenseId) external nonReentrant {
        License storage license = licenses[licenseId];
        require(license.licensee == msg.sender, "Not your license");

        uint256 masterTokenId = license.masterTokenId;
        MasterToken storage master = masterTokens[masterTokenId];

        uint256 treasuryAmount = (master.price * treasuryFee) / 100;
        uint256 artistAmount = master.price - treasuryAmount;

        require(
            toursToken.transferFrom(msg.sender, master.artist, artistAmount),
            "Artist payment failed"
        );
        require(
            toursToken.transferFrom(msg.sender, treasury, treasuryAmount),
            "Treasury payment failed"
        );

        license.expiry = block.timestamp + licensePeriod;
        license.active = true;
    }

    function updatePrice(uint256 masterTokenId, uint256 newPrice) external {
        require(masterTokens[masterTokenId].artist == msg.sender, "Not the artist");
        masterTokens[masterTokenId].price = newPrice;
        emit PriceUpdated(masterTokenId, newPrice);
    }

    function toggleSales(uint256 masterTokenId) external {
        require(masterTokens[masterTokenId].artist == msg.sender, "Not the artist");
        masterTokens[masterTokenId].active = !masterTokens[masterTokenId].active;
    }

    function burnExpiredLicense(uint256 licenseId) external nonReentrant {
        License storage license = licenses[licenseId];
        require(block.timestamp > license.expiry, "Not expired");
        require(license.active, "Already burned");

        license.active = false;
        _burn(licenseId);

        emit LicenseExpired(licenseId);
    }

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

    // ============================================
    // ✅ NEW: Staking Functions
    // ============================================

    /**
     * @notice Stake an NFT to earn TOURS rewards
     * @param tokenId The token to stake (can be master or license)
     */
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

    /**
     * @notice Unstake an NFT and claim rewards
     * @param tokenId The token to unstake
     */
    function unstakeNFT(uint256 tokenId) external nonReentrant {
        StakingInfo storage info = stakingInfo[tokenId];
        require(info.isStaked, "Not staked");
        require(info.staker == msg.sender, "Not staker");

        // Calculate and pay rewards
        uint256 rewards = calculatePendingRewards(tokenId);
        if (rewards > 0) {
            require(toursToken.transfer(msg.sender, rewards), "Reward transfer failed");
        }

        // Remove from user's staked tokens array
        uint256 index = stakedTokenIndex[tokenId];
        uint256 lastIndex = userStakedTokens[msg.sender].length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = userStakedTokens[msg.sender][lastIndex];
            userStakedTokens[msg.sender][index] = lastTokenId;
            stakedTokenIndex[lastTokenId] = index;
        }

        userStakedTokens[msg.sender].pop();
        delete stakedTokenIndex[tokenId];

        // Clear staking info
        delete stakingInfo[tokenId];
        totalStaked--;

        emit NFTUnstaked(tokenId, msg.sender, rewards, block.timestamp);
    }

    /**
     * @notice Claim staking rewards without unstaking
     * @param tokenId The staked token
     */
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

    /**
     * @notice Calculate pending staking rewards
     * @param tokenId The staked token
     */
    function calculatePendingRewards(uint256 tokenId) public view returns (uint256) {
        StakingInfo memory info = stakingInfo[tokenId];
        if (!info.isStaked) return 0;

        uint256 timeStaked = block.timestamp - info.lastClaimAt;
        uint256 daysStaked = timeStaked / SECONDS_PER_DAY;

        return daysStaked * stakingRewardRate;
    }

    /**
     * @notice Get all staked tokens for a user
     * @param user The user address
     */
    function getUserStakedTokens(address user) external view returns (uint256[] memory) {
        return userStakedTokens[user];
    }

    // ============================================
    // ✅ NEW: Burning Functions
    // ============================================

    /**
     * @notice Burn an NFT to receive TOURS reward
     * @param tokenId The token to burn (master or license)
     */
    function burnNFT(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!stakingInfo[tokenId].isStaked, "Cannot burn staked NFT");

        // If it's a license, mark as inactive
        if (licenses[tokenId].active) {
            licenses[tokenId].active = false;
        }

        // Burn the token
        _burn(tokenId);

        // Clear staking info if any
        delete stakingInfo[tokenId];

        totalBurned++;

        // Reward burner
        if (burnRewardAmount > 0) {
            require(toursToken.transfer(msg.sender, burnRewardAmount), "Reward transfer failed");
        }

        emit NFTBurned(tokenId, msg.sender, burnRewardAmount, block.timestamp);
    }

    /**
     * @notice Burn an NFT on behalf of the owner (requires approval)
     * @param owner The owner of the NFT
     * @param tokenId The token to burn (master or license)
     */
    function burnNFTFor(address owner, uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == owner, "Incorrect owner");
        require(!stakingInfo[tokenId].isStaked, "Cannot burn staked NFT");

        // Check authorization
        require(
            msg.sender == owner ||
            isApprovedForAll(owner, msg.sender) ||
            getApproved(tokenId) == msg.sender,
            "Not authorized to burn"
        );

        // If it's a license, mark as inactive
        if (licenses[tokenId].active) {
            licenses[tokenId].active = false;
        }

        // Burn the token
        _burn(tokenId);

        // Clear staking info if any
        delete stakingInfo[tokenId];

        totalBurned++;

        // Reward the owner (not the caller)
        if (burnRewardAmount > 0) {
            require(toursToken.transfer(owner, burnRewardAmount), "Reward transfer failed");
        }

        emit NFTBurned(tokenId, owner, burnRewardAmount, block.timestamp);
    }

    // ============================================
    // ✅ NEW: NFT Type Query Functions
    // ============================================

    /**
     * @notice Get all master tokens of a specific type
     * @param nftType The type to filter by (MUSIC or ART)
     * @return Array of token IDs matching the type
     */
    function getMastersByType(NFTType nftType) external view returns (uint256[] memory) {
        uint256 count = 0;

        // First pass: count matching tokens
        for (uint256 i = 1; i <= _masterTokenCounter; i++) {
            if (masterTokens[i].artist != address(0) && masterTokens[i].nftType == nftType) {
                count++;
            }
        }

        // Second pass: populate array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i <= _masterTokenCounter; i++) {
            if (masterTokens[i].artist != address(0) && masterTokens[i].nftType == nftType) {
                result[index] = i;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get the NFT type of a master token
     * @param tokenId The master token ID
     * @return The NFT type (MUSIC or ART)
     */
    function getMasterType(uint256 tokenId) external view returns (NFTType) {
        require(masterTokens[tokenId].artist != address(0), "Master doesn't exist");
        return masterTokens[tokenId].nftType;
    }

    // ============================================
    // ✅ NEW: Admin Functions for Staking/Burning
    // ============================================

    function updateStakingRewardRate(uint256 newRate) external onlyOwner {
        stakingRewardRate = newRate;
        emit RewardRateUpdated(newRate, block.timestamp);
    }

    function updateBurnReward(uint256 newReward) external onlyOwner {
        burnRewardAmount = newReward;
        emit BurnRewardUpdated(newReward, block.timestamp);
    }

    function withdrawTreasury(address to, uint256 amount) external onlyOwner {
        require(toursToken.transfer(to, amount), "Transfer failed");
    }

    // ============================================
    // Override to prevent transfer of staked NFTs
    // ============================================

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        // Prevent transfer of staked NFTs (except burning)
        if (to != address(0)) { // Not a burn
            require(!stakingInfo[tokenId].isStaked, "Cannot transfer staked NFT");
        }
        return super._update(to, tokenId, auth);
    }
}
