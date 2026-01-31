// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title DeploymentNFT
 * @notice ERC721 minted per DAO-deployed contract as on-chain provenance.
 *         Stores proposal details, IPFS code hash, deployed address, and timestamp.
 */
contract DeploymentNFT is ERC721, Ownable {
    using Strings for uint256;
    using Strings for address;

    struct DeploymentMetadata {
        uint256 proposalId;
        string prompt;
        string ipfsCodeHash;
        address deployedContract;
        uint256 deployedAt;
    }

    uint256 private _nextTokenId;
    address public factory; // only the factory can mint

    mapping(uint256 => DeploymentMetadata) public deployments;

    event DeploymentRecorded(
        uint256 indexed tokenId,
        uint256 indexed proposalId,
        address indexed deployedContract,
        string ipfsCodeHash
    );

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory");
        _;
    }

    constructor() ERC721("EmpowerTours Deployment", "ETDEPLOY") Ownable(msg.sender) {}

    /**
     * @notice Set the factory address (only owner, one-time setup).
     */
    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
    }

    /**
     * @notice Mint a deployment NFT — only callable by the factory.
     */
    function mint(
        address to,
        uint256 proposalId,
        string calldata prompt,
        string calldata ipfsCodeHash,
        address deployedContract
    ) external onlyFactory returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        deployments[tokenId] = DeploymentMetadata({
            proposalId: proposalId,
            prompt: prompt,
            ipfsCodeHash: ipfsCodeHash,
            deployedContract: deployedContract,
            deployedAt: block.timestamp
        });

        emit DeploymentRecorded(tokenId, proposalId, deployedContract, ipfsCodeHash);
    }

    /**
     * @notice On-chain SVG metadata for the deployment NFT.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        DeploymentMetadata storage d = deployments[tokenId];

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">',
            '<rect width="400" height="300" fill="#0f172a" rx="16"/>',
            '<text x="20" y="40" fill="#22d3ee" font-size="18" font-family="monospace">EmpowerTours Deploy #', tokenId.toString(), '</text>',
            '<text x="20" y="70" fill="#94a3b8" font-size="12" font-family="monospace">Proposal: #', d.proposalId.toString(), '</text>',
            '<text x="20" y="95" fill="#94a3b8" font-size="12" font-family="monospace">Contract: ', _truncateAddress(d.deployedContract), '</text>',
            '<text x="20" y="120" fill="#94a3b8" font-size="12" font-family="monospace">IPFS: ', _truncateString(d.ipfsCodeHash, 20), '</text>',
            '<text x="20" y="155" fill="#e2e8f0" font-size="11" font-family="monospace">', _truncateString(d.prompt, 45), '</text>',
            '<rect x="20" y="250" width="360" height="30" fill="#1e293b" rx="6"/>',
            '<text x="200" y="270" fill="#22d3ee" font-size="11" font-family="monospace" text-anchor="middle">DAO Governed | Immutable | On-Chain</text>',
            '</svg>'
        ));

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name":"EmpowerTours Deployment #', tokenId.toString(),
            '","description":"DAO-governed contract deployment via Claude AI generation pipeline.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","attributes":[',
            '{"trait_type":"Proposal ID","value":"', d.proposalId.toString(), '"},',
            '{"trait_type":"Deployed Contract","value":"', Strings.toHexString(d.deployedContract), '"},',
            '{"trait_type":"IPFS Code","value":"', d.ipfsCodeHash, '"},',
            '{"trait_type":"Deployed At","display_type":"date","value":', d.deployedAt.toString(), '}',
            ']}'
        ))));

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function _truncateAddress(address addr) internal pure returns (string memory) {
        string memory full = Strings.toHexString(addr);
        // Return first 10 chars + ... + last 8 chars
        bytes memory b = bytes(full);
        if (b.length <= 20) return full;
        bytes memory result = new bytes(21);
        for (uint i = 0; i < 10; i++) result[i] = b[i];
        result[10] = '.';
        result[11] = '.';
        result[12] = '.';
        for (uint i = 0; i < 8; i++) result[13 + i] = b[b.length - 8 + i];
        return string(result);
    }

    function _truncateString(string memory str, uint maxLen) internal pure returns (string memory) {
        bytes memory b = bytes(str);
        if (b.length <= maxLen) return str;
        bytes memory result = new bytes(maxLen + 3);
        for (uint i = 0; i < maxLen; i++) result[i] = b[i];
        result[maxLen] = '.';
        result[maxLen + 1] = '.';
        result[maxLen + 2] = '.';
        return string(result);
    }
}
