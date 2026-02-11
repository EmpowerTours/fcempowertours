// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConsensusNFT
 * @notice One-time Consensus Hong Kong 2026 Commemorative NFT
 * 
 * Minting Model:
 * - Backend service calls mint() on behalf of user
 * - NFT is minted to beneficiary address (monadAddress)
 * - Payment (100 WMON) is handled separately via UserSafe
 * - One-time per Ethereum address (proof of attendance)
 * 
 * Security Features:
 * - ReentrancyGuard on mint to prevent reentrancy attacks
 * - One-time per Ethereum address enforced on-chain
 * - Input validation on all parameters
 * - Event logging for audit trail
 */
contract ConsensusNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _tokenIdCounter;

    // Track which Ethereum addresses have already minted (prevents double-minting)
    mapping(address => bool) public hasMinted;

    // Events for audit trail
    event ConsensusMinted(
        uint256 indexed tokenId,
        address indexed beneficiary,
        address indexed ethereumAddress,
        uint256 timestamp
    );

    constructor() ERC721("Consensus Hong Kong 2026", "CONSENSUS-HK-26") Ownable(msg.sender) {}

    /**
     * @notice Mint a Consensus NFT for an Ethereum address holder
     * 
     * Minting flow:
     * 1. Backend receives mint request from frontend
     * 2. Verifies Ethereum address owns Consensus NFT on Ethereum
     * 3. Processes 100 WMON payment via UserSafe (off-chain)
     * 4. Calls this function to mint NFT to beneficiary
     * 
     * Security checks:
     * - Address validation
     * - One-time per Ethereum address (enforced on-chain)
     * - Reentrancy protection
     * - MetadataURI validation
     * 
     * @param beneficiary The address receiving the NFT (monad address)
     * @param ethereumAddress The Ethereum address that owns the Consensus NFT (proof of attendance)
     * @param metadataURI IPFS URI for the commemorative artwork
     * 
     * @return tokenId The newly minted token ID
     */
    function mint(
        address beneficiary,
        address ethereumAddress,
        string calldata metadataURI
    ) external nonReentrant returns (uint256) {
        // Validate input addresses
        require(beneficiary != address(0), "Invalid beneficiary address");
        require(ethereumAddress != address(0), "Invalid Ethereum address");
        
        // Prevent double-minting: enforce one-time per Ethereum address
        require(!hasMinted[ethereumAddress], "Already minted - one per address only");
        
        // Validate metadataURI is not empty
        require(bytes(metadataURI).length > 0, "MetadataURI cannot be empty");

        uint256 tokenId = _tokenIdCounter++;

        // Mark as minted BEFORE transfer (prevent reentrancy)
        hasMinted[ethereumAddress] = true;

        // Mint the NFT to the beneficiary
        _safeMint(beneficiary, tokenId);
        
        // Set metadata
        _setTokenURI(tokenId, metadataURI);

        // Emit event for transparency and audit trail
        emit ConsensusMinted(tokenId, beneficiary, ethereumAddress, block.timestamp);

        return tokenId;
    }

    /**
     * @notice Check if an Ethereum address has already minted
     * @param ethereumAddress The Ethereum address to check
     * @return true if address has minted, false otherwise
     */
    function hasAlreadyMinted(address ethereumAddress) external view returns (bool) {
        return hasMinted[ethereumAddress];
    }

    /**
     * @notice Get total NFTs minted so far
     * @return The next token ID (current count)
     */
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ============================================
    // Required Overrides
    // ============================================

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

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721)
    {
        super._increaseBalance(account, value);
    }
}
