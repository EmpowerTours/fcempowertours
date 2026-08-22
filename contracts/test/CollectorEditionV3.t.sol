// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address paymentReceiver
    ) external;
}

interface IWmon {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

struct MintReq {
    address artist;
    uint256 artistFid;
    string uri;
    uint32 maxCollectorEditions;
    address referrer;
    uint96 royaltyBps;
    uint8 nftType;
    uint256 price;
    uint256 collectorPrice;
    uint256 nonce;
    uint256 deadline;
}

interface ISales {
    function mintMasterFor(MintReq calldata req, bytes calldata signature)
        external
        returns (uint256);
    function purchase(uint256 masterTokenId, bool isCollector, string calldata uri)
        external
        returns (uint256);
    function pricing(uint256) external view returns (uint256, uint256, bool);
    function domainSeparator() external view returns (bytes32);
}

interface IRegistry {
    function getMaster(uint256)
        external
        view
        returns (
            address artist,
            uint256 artistFid,
            uint64 createdAt,
            uint32 maxCollectorEditions,
            uint32 collectorsMinted,
            uint8 nftType,
            address referrer,
            uint96 royaltyShareBps,
            address royaltyShareSink
        );
    function ownerOf(uint256) external view returns (address);
}

/**
 * @title Collector editions under v3, minted the way the app mints them
 *
 * @dev `mint_collector` used to call V2's `mintCollectorMaster`, which let the platform assert who
 *      the artist was and stored a second `collectorTokenURI` for the edition artwork. Neither
 *      exists in v3: there is no collector entrypoint at all. A collector edition is simply a
 *      master with `maxCollectorEditions` and `collectorPrice` set, minted through the same signed
 *      `mintMasterFor` relay as any other master.
 *
 *      These tests run that shape against the live deployed contracts, relayed by a real Safe, and
 *      pin the three things the route now depends on: the terms survive the relay, the buyer is
 *      charged the collector price, and the edition cap is enforced by the chain.
 */
contract CollectorEditionV3Test is Test {
    address constant REGISTRY = 0x42EbcD44C2295702130f0A641633c691bA5f9480;
    address constant SALES = 0xf824D444AAf251EB2197836FFb218d48927F8cB1;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    address constant SAFE_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address constant SAFE_4337_MODULE = 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226;

    uint256 constant STANDARD_PRICE = 1 ether;
    uint256 constant COLLECTOR_PRICE = 5 ether;
    uint32 constant MAX_EDITIONS = 2;

    uint256 artistPk = 0xA11CE;
    address artist;
    address buyer = makeAddr("buyer");
    address safe;

    bool forked;

    function setUp() public {
        artist = vm.addr(artistPk);
        try vm.createSelectFork("monad") {
            forked = true;
        } catch {
            forked = false;
            return;
        }

        address[] memory owners = new address[](1);
        owners[0] = makeAddr("botSigner");
        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 1, address(0), "", SAFE_4337_MODULE, address(0), 0, payable(address(0)))
        );
        safe = ISafeProxyFactory(SAFE_FACTORY).createProxyWithNonce(SAFE_SINGLETON, initializer, 7);

        vm.deal(safe, 100 ether);
        vm.prank(safe);
        IWmon(WMON).deposit{value: 60 ether}();
    }

    modifier onlyForked() {
        if (!forked) {
            emit log("SKIPPED: no RPC");
            return;
        }
        _;
    }

    function _req(uint32 editions, uint256 collectorPrice, uint256 nonce)
        internal
        view
        returns (MintReq memory)
    {
        return MintReq({
            artist: artist,
            artistFid: 0,
            uri: "ipfs://collector-master",
            maxCollectorEditions: editions,
            referrer: address(0),
            royaltyBps: 500,
            nftType: 0,
            price: STANDARD_PRICE,
            collectorPrice: collectorPrice,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
    }

    function _sign(MintReq memory r, uint256 pk) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "MintRequest(address artist,uint256 artistFid,string uri,uint32 maxCollectorEditions,address referrer,uint96 royaltyBps,uint8 nftType,uint256 price,uint256 collectorPrice,uint256 nonce,uint256 deadline)"
                ),
                r.artist,
                r.artistFid,
                keccak256(bytes(r.uri)),
                r.maxCollectorEditions,
                r.referrer,
                r.royaltyBps,
                r.nftType,
                r.price,
                r.collectorPrice,
                r.nonce,
                r.deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", ISales(SALES).domainSeparator(), structHash));
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(pk, digest);
        return abi.encodePacked(rr, ss, v);
    }

    /// @dev Mint relayed by the Safe, exactly as `mint_collector` now does under v3.
    function _relayedMint(uint32 editions, uint256 collectorPrice, uint256 nonce)
        internal
        returns (uint256)
    {
        MintReq memory r = _req(editions, collectorPrice, nonce);
        bytes memory sig = _sign(r, artistPk);
        vm.prank(safe);
        return ISales(SALES).mintMasterFor(r, sig);
    }

    // =====================================================================

    /**
     * @dev The relay must not change the terms. The Safe sends the transaction, but the master
     *      belongs to the artist and carries the edition count and price they signed.
     */
    function test_TheSafeRelaysButTheArtistOwnsTheCollectorMaster() public onlyForked {
        uint256 masterId = _relayedMint(MAX_EDITIONS, COLLECTOR_PRICE, 1);

        (address owner,,, uint32 maxEditions, uint32 minted,,,,) =
            IRegistry(REGISTRY).getMaster(masterId);
        assertEq(owner, artist, "the artist owns the master, not the relaying Safe");
        assertEq(IRegistry(REGISTRY).ownerOf(masterId), artist, "and holds the token");
        assertEq(maxEditions, MAX_EDITIONS, "the signed edition cap survived the relay");
        assertEq(minted, 0, "nothing minted yet");

        (uint256 price, uint256 collectorPrice,) = ISales(SALES).pricing(masterId);
        assertEq(price, STANDARD_PRICE, "standard price survived");
        assertEq(collectorPrice, COLLECTOR_PRICE, "collector price survived");
    }

    /// @dev A collector purchase is charged the collector price, not the standard one.
    function test_ACollectorPurchaseChargesTheCollectorPrice() public onlyForked {
        uint256 masterId = _relayedMint(MAX_EDITIONS, COLLECTOR_PRICE, 2);
        uint256 before = IWmon(WMON).balanceOf(safe);

        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, COLLECTOR_PRICE);
        uint256 licenseId = ISales(SALES).purchase(masterId, true, "ipfs://edition-art");
        vm.stopPrank();

        assertEq(before - IWmon(WMON).balanceOf(safe), COLLECTOR_PRICE, "charged the collector price");
        assertEq(IRegistry(REGISTRY).ownerOf(licenseId), safe, "minted to msg.sender as ever");

        (,,,, uint32 minted,,,,) = IRegistry(REGISTRY).getMaster(masterId);
        assertEq(minted, 1, "the edition counter moved");
    }

    /// @dev The cap is the contract's, not the UI's.
    function test_EditionsAreCappedOnChain() public onlyForked {
        uint256 masterId = _relayedMint(MAX_EDITIONS, COLLECTOR_PRICE, 3);

        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, COLLECTOR_PRICE * 3);
        ISales(SALES).purchase(masterId, true, "ipfs://1");
        ISales(SALES).purchase(masterId, true, "ipfs://2");
        vm.expectRevert();
        ISales(SALES).purchase(masterId, true, "ipfs://3");
        vm.stopPrank();

        (,,,, uint32 minted,,,,) = IRegistry(REGISTRY).getMaster(masterId);
        assertEq(minted, MAX_EDITIONS, "sold out at exactly the signed cap");
    }

    /**
     * @dev Why the route rejects `maxCollectorEditions == 0` before spending gas: the mint itself
     *      succeeds, producing an ordinary master, and only the first collector purchase fails.
     *      Without the up-front check an artist would pay to publish a collector edition that
     *      nobody can ever buy as one.
     */
    function test_ZeroEditionsMintsFineAndIsUnbuyableAsACollectorEdition() public onlyForked {
        uint256 masterId = _relayedMint(0, COLLECTOR_PRICE, 4);

        (,,, uint32 maxEditions,,,,,) = IRegistry(REGISTRY).getMaster(masterId);
        assertEq(maxEditions, 0, "the mint went through - nothing on-chain objects");

        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, COLLECTOR_PRICE);
        vm.expectRevert();
        ISales(SALES).purchase(masterId, true, "ipfs://never");
        vm.stopPrank();
    }

    /**
     * @dev The relayer cannot rewrite the terms. This is the guarantee that lets a Safe pay gas
     *      for a mint it does not control, and it is why the route compares the signed request
     *      against the loose params instead of trusting either alone.
     */
    function test_ARelayerCannotAlterTheSignedTerms() public onlyForked {
        MintReq memory r = _req(MAX_EDITIONS, COLLECTOR_PRICE, 5);
        bytes memory sig = _sign(r, artistPk);

        r.collectorPrice = 1 wei; // tampered after signing
        vm.prank(safe);
        vm.expectRevert();
        ISales(SALES).mintMasterFor(r, sig);
    }
}
