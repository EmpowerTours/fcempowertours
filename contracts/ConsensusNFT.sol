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
 * Security Features:
 * - ReentrancyGuard on mint to prevent reentrancy attacks
 * - One-time per Ethereum address enforced on-chain
 * - Authorized minters only (backend service authentication)
 * - Input validation on all parameters
 * - Event logging for audit trail
 */
contract ConsensusNFT is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _tokenIdCounter;

    // Track which Ethereum addresses have already minted (prevents double-minting)
    mapping(address => bool) public hasMinted;

    // Authorized minter (backend service only)
    mapping(address => bool) public authorizedMinters;

    // Events for audit trail
    event ConsensusMinted(
        uint256 indexed tokenId,
        address indexed monadAddress,
        address indexed ethereumAddress,
        uint256 timestamp
    );

    event MinterAuthorized(address indexed minter);
    event MinterRevoked(address indexed minter);

    constructor() ERC721("Consensus Hong Kong 2026", "CONSENSUS-HK-26") {
        authorizedMinters[msg.sender] = true;
    }

    /**
     * @notice Authorize an address to mint Consensus NFTs
     * Only owner can call - prevents unauthorized minting
     */
    function authorizeMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter);
    }

    /**
     * @notice Revoke minting authorization
     * Only owner can call - emergency revocation capability
     */
    function revokeMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        authorizedMinters[minter] = false;
        emit MinterRevoked(minter);
    }

    /**
     * @notice Mint a Consensus NFT for an Ethereum address holder
     * 
     * Security checks:
     * - Only authorized minters (backend service)
     * - Address validation
     * - One-time per Ethereum address (enforced on-chain)
     * - Reentrancy protection
     * - TokenURI validation
     * 
     * @param monadAddress The Monad address receiving the NFT
     * @param ethereumAddress The Ethereum address that owns the Consensus NFT (proof of attendance)
     * @param tokenURI IPFS URI for the commemorative artwork
     * 
     * @return tokenId The newly minted token ID
     */
    function mint(
        address monadAddress,
        address ethereumAddress,
        string calldata tokenURI
    ) external nonReentrant returns (uint256) {
        // Validate caller is authorized minter
        require(authorizedMinters[msg.sender], "Not authorized to mint");
        
        // Validate input addresses
        require(monadAddress != address(0), "Invalid Monad address");
        require(ethereumAddress != address(0), "Invalid Ethereum address");
        
        // Prevent double-minting: enforce one-time per Ethereum address
        require(!hasMinted[ethereumAddress], "Already minted - one per address only");
        
        // Validate tokenURI is not empty
        require(bytes(tokenURI).length > 0, "TokenURI cannot be empty");

        uint256 tokenId = _tokenIdCounter++;

        // Mark as minted BEFORE transfer (prevent reentrancy)
        hasMinted[ethereumAddress] = true;

        // Mint the NFT to the Monad address
        _safeMint(monadAddress, tokenId);
        
        // Set metadata
        _setTokenURI(tokenId, tokenURI);

        // Emit event for transparency and audit trail
        emit ConsensusMinted(tokenId, monadAddress, ethereumAddress, block.timestamp);

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
