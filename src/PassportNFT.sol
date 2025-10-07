// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";


contract PassportNFT is ERC721, Ownable {
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 private _tokenIdCounter;

    // Pass ERC721 args to ERC721 constructor
    // Pass msg.sender to Ownable constructor
    constructor(string memory name, string memory symbol)
        ERC721(name, symbol)
        Ownable(msg.sender)
    {}

    function mint(address to) external payable {
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        _tokenIdCounter++;
        _safeMint(to, _tokenIdCounter);
    }

    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}
