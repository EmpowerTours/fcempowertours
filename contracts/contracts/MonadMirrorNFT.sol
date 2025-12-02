// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MonadMirrorNFT
 * @dev Soulbound NFT representing user's Monad Sync clarity score
 * - Non-transferable (except minting)
 * - Dynamic metadata based on clarity score
 * - Costs 10 TOURS to mint
 */
contract MonadMirrorNFT is ERC721, ERC721URIStorage, Ownable {
    // TOURS token for payment
    IERC20 public toursToken;

    // Mint price (10 TOURS)
    uint256 public constant MINT_PRICE = 10 ether;

    // Token counter
    uint256 private _tokenIdCounter;

    // Treasury for collected TOURS
    address public treasury;

    // Monad Mirror data
    struct MonadMirror {
        uint256 clarityScore;  // Scaled by 10 (e.g., 987 = 98.7%)
        string tier;            // "Dominant Monad", "Rational Monad", etc.
        uint256 mintedAt;
        bool exists;
    }

    // Mapping from token ID to Monad Mirror data
    mapping(uint256 => MonadMirror) public monadMirrors;

    // Mapping from user to token ID (one per user)
    mapping(address => uint256) public userToTokenId;

    // Events
    event MonadMirrorMinted(address indexed to, uint256 indexed tokenId, uint256 clarityScore, string tier);
    event MonadMirrorUpdated(uint256 indexed tokenId, uint256 newClarityScore, string newTier);

    constructor(
        address _toursToken,
        address _treasury
    ) ERC721("Monad Mirror", "MIRROR") Ownable(msg.sender) {
        toursToken = IERC20(_toursToken);
        treasury = _treasury;
    }

    /**
     * @dev Mint a Monad Mirror NFT
     * @param to Recipient address
     * @param metadataURI IPFS or API URI for metadata
     * @param clarityScore Clarity score (scaled by 10)
     * @param tier Monad tier
     */
    function mintMonadMirror(
        address to,
        string memory metadataURI,
        uint256 clarityScore,
        string memory tier
    ) external returns (uint256) {
        require(to != address(0), "Cannot mint to zero address");
        require(userToTokenId[to] == 0, "User already has a Monad Mirror");
        require(clarityScore <= 999, "Clarity score must be <= 99.9%");

        // Transfer 10 TOURS from caller to treasury
        require(
            toursToken.transferFrom(msg.sender, treasury, MINT_PRICE),
            "TOURS payment failed"
        );

        // Mint NFT
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Store Monad Mirror data
        monadMirrors[tokenId] = MonadMirror({
            clarityScore: clarityScore,
            tier: tier,
            mintedAt: block.timestamp,
            exists: true
        });

        userToTokenId[to] = tokenId;

        emit MonadMirrorMinted(to, tokenId, clarityScore, tier);

        return tokenId;
    }

    /**
     * @dev Update Monad Mirror clarity score (for retakes)
     * Costs 5 TOURS
     */
    function updateMonadMirror(
        uint256 tokenId,
        string memory newMetadataURI,
        uint256 newClarityScore,
        string memory newTier
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(monadMirrors[tokenId].exists, "Token does not exist");
        require(newClarityScore <= 999, "Clarity score must be <= 99.9%");

        // Transfer 5 TOURS for retake
        require(
            toursToken.transferFrom(msg.sender, treasury, 5 ether),
            "TOURS payment failed"
        );

        // Update metadata
        _setTokenURI(tokenId, newMetadataURI);

        // Update monad data
        monadMirrors[tokenId].clarityScore = newClarityScore;
        monadMirrors[tokenId].tier = newTier;

        emit MonadMirrorUpdated(tokenId, newClarityScore, newTier);
    }

    /**
     * @dev Override transfer to make soulbound (non-transferable)
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0))
        // Block all other transfers
        if (from != address(0)) {
            revert("Monad Mirror NFTs are soulbound and cannot be transferred");
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Get Monad Mirror data for a token
     */
    function getMonadMirror(uint256 tokenId) external view returns (
        uint256 clarityScore,
        string memory tier,
        uint256 mintedAt,
        address owner
    ) {
        require(monadMirrors[tokenId].exists, "Token does not exist");

        MonadMirror memory mirror = monadMirrors[tokenId];
        return (
            mirror.clarityScore,
            mirror.tier,
            mirror.mintedAt,
            ownerOf(tokenId)
        );
    }

    /**
     * @dev Get user's Monad Mirror token ID
     */
    function getUserTokenId(address user) external view returns (uint256) {
        return userToTokenId[user];
    }

    /**
     * @dev Update treasury address (owner only)
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
    }

    /**
     * @dev Get total supply
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // Required overrides
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
