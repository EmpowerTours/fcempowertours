// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MusicNFT is ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    constructor() ERC721("MusicNFT", "MNFT") Ownable() {}

    function mint(address to, string memory uri) external onlyOwner {
        _tokenIdCounter++;
        _mint(to, _tokenIdCounter);
        _setTokenURI(_tokenIdCounter, uri);
    }
}
