import assert from "assert";
import pkg from "generated";
const { TestHelpers } = pkg;
const { MockDb, MusicLicenseNFT, Addresses } = TestHelpers;

describe("Music NFT Minting", () => {
  it("Should mint a Music NFT and create entity", async () => {
    // Instantiate a mock DB
    const mockDb = MockDb.createMockDb();

    // Get mock addresses from helpers
    const artistAddress = Addresses.mockAddresses[0];

    // Create a mock MasterMinted event (NOT MusicMinted)
    const mockMasterMinted = MusicLicenseNFT.MasterMinted.createMockEvent({
      tokenId: 1n,
      artist: artistAddress,
      tokenURI: "ipfs://QmTest123",
      price: 1000000000000000000n,
    });

    // Process the mockEvent
    const mockDbAfterMint = await MusicLicenseNFT.MasterMinted.processEvent({
      event: mockMasterMinted,
      mockDb,
    });

    // Get the minted Music NFT
    const musicNFTId = `music-${mockMasterMinted.chainId}-1`;
    const mintedNFT = mockDbAfterMint.entities.MusicNFT.get(musicNFTId);

    // Assert the NFT was created
    assert.notEqual(
      mintedNFT,
      undefined,
      "Music NFT should have been created",
    );

    // Assert the NFT properties
    assert.equal(
      mintedNFT?.tokenId,
      "1",
      "Token ID should be 1",
    );

    assert.equal(
      mintedNFT?.artist.toLowerCase(),
      artistAddress.toLowerCase(),
      "Artist should match",
    );

    assert.equal(
      mintedNFT?.royaltyPercentage,
      10,
      "Royalty percentage should be 10%",
    );

    assert.equal(
      mintedNFT?.tokenURI,
      "ipfs://QmTest123",
      "Token URI should match",
    );
  });
});

describe("Music NFT Transfer", () => {
  it("Should update owner on transfer", async () => {
    // Instantiate a mock DB
    const mockDbEmpty = MockDb.createMockDb();

    // Get mock addresses
    const artistAddress = Addresses.mockAddresses[0];
    const buyerAddress = Addresses.mockAddresses[1];

    // Create a mock Transfer event first to get the chainId
    const mockTransfer = MusicLicenseNFT.Transfer.createMockEvent({
      from: artistAddress,
      to: buyerAddress,
      tokenId: 1n,
    });

    // Use the correct ID format that matches the handler
    const musicNFTId = `music-${mockTransfer.chainId}-1`;
    
    const mockMusicNFT = {
      id: musicNFTId,
      tokenId: "1",
      contract: "0xaD849874B0111131A30D7D2185Cc1519A83dd3D0",
      artist: artistAddress.toLowerCase(),
      owner: artistAddress.toLowerCase(),
      tokenURI: "ipfs://QmTest123",
      coverArt: "",
      price: 0n,
      totalSold: 0,
      active: true,
      royaltyPercentage: 10,
      name: "Test Music NFT",
      description: "Test description",
      imageUrl: "",
      previewAudioUrl: "",
      fullAudioUrl: "",
      metadataFetched: false,
      isArt: false,
      isStaked: false,
      stakedAt: 0n,
      staker: "",
      isBurned: false,
      burnedAt: 0n,
      mintedAt: new Date(),
      blockNumber: 442333597192n,
      txHash: "0x1234567890abcdef",
    };

    // Set initial state
    const mockDb = mockDbEmpty.entities.MusicNFT.set(mockMusicNFT);

    // Process the transfer
    const mockDbAfterTransfer = await MusicLicenseNFT.Transfer.processEvent({
      event: mockTransfer,
      mockDb,
    });

    // Get the NFT after transfer
    const transferredNFT = mockDbAfterTransfer.entities.MusicNFT.get(musicNFTId);

    // Assert owner was updated
    assert.equal(
      transferredNFT?.owner.toLowerCase(),
      buyerAddress.toLowerCase(),
      "Owner should be updated to buyer address",
    );

    // Assert other properties remain unchanged
    assert.equal(
      transferredNFT?.artist.toLowerCase(),
      artistAddress.toLowerCase(),
      "Artist should remain unchanged",
    );
  });
});
