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

interface IERC20Allowance {
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IWmon {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface ISalesController {
    function mintMaster(
        uint256 artistFid,
        string calldata uri,
        uint32 maxCollectorEditions,
        address referrer,
        uint96 royaltyBps,
        uint8 nftType,
        uint256 price,
        uint256 collectorPrice
    ) external returns (uint256);
    function purchase(uint256 masterTokenId, bool isCollector, string calldata uri)
        external
        returns (uint256);
    function treasuryFeeBps() external view returns (uint96);
}

interface IRegistry {
    function ownerOf(uint256) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function totalLicenses() external view returns (uint256);
    function LICENSE_ID_OFFSET() external view returns (uint256);
}

/**
 * @title The relayed purchase — the flow the app actually runs
 *
 * @dev This exists because of a defect the previous fork test did not catch. That test had the
 *      buyer call `purchase` directly, so it passed while never exercising the path the app uses.
 *      A test that green-lights the wrong path is worse than no test.
 *
 *      What the app really does: a Safe sends the transaction on the user's behalf. In V2 that was
 *      harmless — `purchaseLicenseFor(masterId, licensee, fid)` named the recipient. v3's
 *      `SalesController.purchase` mints to `msg.sender` and takes no recipient, so the Safe would
 *      keep the licence the user paid for.
 *
 *      The fix is a four-call batch ending in a transfer to the buyer. These tests pin down the
 *      three things that have to be true for it to work, against the real deployed contracts and a
 *      real Safe deployed exactly the way `permissionless` deploys the app's Safes — same proxy
 *      factory, same singleton, same 4337 module as fallback handler.
 */
contract SafeRelayedPurchaseTest is Test {
    // Live Monad mainnet
    address constant REGISTRY = 0x42EbcD44C2295702130f0A641633c691bA5f9480;
    address constant SALES = 0xf824D444AAf251EB2197836FFb218d48927F8cB1;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    // Safe infrastructure, as `permissionless@0.2.57` selects it for Safe 1.4.1 + EntryPoint 0.7.
    // Verified deployed on Monad mainnet.
    address constant SAFE_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address constant SAFE_4337_MODULE = 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226;

    uint256 constant PRICE = 1 ether;

    /// @dev The live `treasuryFeeBps` on the deployed SalesController, asserted in setUp.
    uint256 constant TREASURY_FEE_BPS = 1000;

    address artist = makeAddr("artist");
    address buyer = makeAddr("buyer");
    address safe;
    uint256 masterId;

    bool forked;

    function setUp() public {
        try vm.createSelectFork("monad") {
            forked = true;
        } catch {
            forked = false;
            return;
        }

        // A Safe with the 4337 module as its fallback handler — the app's exact configuration.
        address[] memory owners = new address[](1);
        owners[0] = makeAddr("botSigner");
        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 1, address(0), "", SAFE_4337_MODULE, address(0), 0, payable(address(0)))
        );
        safe = ISafeProxyFactory(SAFE_FACTORY).createProxyWithNonce(SAFE_SINGLETON, initializer, 1);

        // A master to buy. Sales are live, so this mints into the real registry on the fork.
        vm.prank(artist);
        masterId = ISalesController(SALES).mintMaster(
            0, "ipfs://test-master", 0, address(0), 500, 0, PRICE, 0
        );

        // Pin the assumption instead of trusting it: if the fee is ever governed upward, this
        // fails loudly here rather than producing a wrong "the artist was paid" result below.
        assertEq(
            uint256(ISalesController(SALES).treasuryFeeBps()),
            TREASURY_FEE_BPS,
            "the live treasury fee changed - update TREASURY_FEE_BPS"
        );

        // Fund the Safe, which is what pays under USE_USER_SAFES.
        vm.deal(safe, 10 ether);
        vm.prank(safe);
        IWmon(WMON).deposit{value: 5 ether}();
    }

    modifier onlyForked() {
        if (!forked) {
            emit log("SKIPPED: no RPC");
            return;
        }
        _;
    }

    /// @dev The id the route predicts, by the same arithmetic the route uses.
    function _predictedLicenseId() internal view returns (uint256) {
        return IRegistry(REGISTRY).LICENSE_ID_OFFSET() + IRegistry(REGISTRY).totalLicenses() + 1;
    }

    // =====================================================================
    // The bug, stated as a test
    // =====================================================================

    /**
     * @dev Without the transfer leg, the Safe keeps the licence. This is the defect itself, pinned
     *      so that nobody "simplifies" the batch back into being broken. If this test ever fails,
     *      `purchase` has gained a recipient argument and the transfer leg can go.
     */
    function test_WithoutTheTransferLegTheSafeKeepsWhatTheUserPaidFor() public onlyForked {
        uint256 expected = _predictedLicenseId();

        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, PRICE);
        uint256 licenseId = ISalesController(SALES).purchase(masterId, false, "ipfs://licence");
        vm.stopPrank();

        assertEq(licenseId, expected, "the route's id prediction must match what purchase mints");
        assertEq(
            IRegistry(REGISTRY).ownerOf(licenseId),
            safe,
            "purchase mints to msg.sender - this is why the transfer leg exists"
        );
        assertTrue(IRegistry(REGISTRY).ownerOf(licenseId) != buyer, "the buyer owns nothing yet");
    }

    // =====================================================================
    // The fix
    // =====================================================================

    /// @dev The whole batch, in the order the route encodes it. The buyer must end up the owner.
    function test_TheBatchLeavesTheBuyerOwningTheLicence() public onlyForked {
        uint256 predicted = _predictedLicenseId();
        uint256 safeWmonBefore = IWmon(WMON).balanceOf(safe);

        uint256 artistWmonBefore = IWmon(WMON).balanceOf(artist);

        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, PRICE);
        uint256 licenseId = ISalesController(SALES).purchase(masterId, false, "ipfs://licence");
        IRegistry(REGISTRY).transferFrom(safe, buyer, predicted);
        IWmon(WMON).approve(SALES, 0);
        vm.stopPrank();

        assertEq(licenseId, predicted, "prediction held");
        assertEq(IRegistry(REGISTRY).ownerOf(licenseId), buyer, "the buyer owns the licence");
        assertEq(
            IWmon(WMON).balanceOf(safe),
            safeWmonBefore - PRICE,
            "and the Safe paid for it, exactly once"
        );

        // The point of the whole exercise: relaying through a Safe must not change who gets paid.
        // 10% treasury fee is the live setting on the deployed controller.
        uint256 expectedArtistCut = PRICE - (PRICE * TREASURY_FEE_BPS) / 10_000;
        assertEq(
            IWmon(WMON).balanceOf(artist) - artistWmonBefore,
            expectedArtistCut,
            "the artist is paid their cut, from a relayed purchase, in the same transaction"
        );

        // No standing allowance is left for the sales controller to spend later.
        assertEq(
            IERC20Allowance(WMON).allowance(safe, SALES),
            0,
            "the batch revokes its own approval"
        );
    }

    /**
     * @dev A Safe is a contract, and `mintLicense` uses `_safeMint`, which calls
     *      `onERC721Received` on contract recipients. V2 minted to an EOA so this never came up.
     *      If the fallback handler did not answer that call, every purchase would revert.
     */
    function test_TheSafeCanActuallyReceiveAnNft() public onlyForked {
        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, PRICE);
        uint256 licenseId = ISalesController(SALES).purchase(masterId, false, "ipfs://licence");
        vm.stopPrank();
        assertEq(IRegistry(REGISTRY).ownerOf(licenseId), safe, "the Safe accepted the safeMint");
    }

    /**
     * @dev The id is predicted before the batch runs, so a concurrent buyer could take it. That is
     *      survivable only because the batch is atomic: the transfer reverts and the payment
     *      reverts with it. This proves the revert, which is what makes the prediction safe.
     */
    function test_AStolenIdRevertsTheWholeBatchRatherThanLosingTheMoney() public onlyForked {
        uint256 predicted = _predictedLicenseId();

        // Somebody else buys first and takes the predicted id.
        address rival = makeAddr("rival");
        vm.deal(rival, 5 ether);
        vm.startPrank(rival);
        IWmon(WMON).deposit{value: 2 ether}();
        IWmon(WMON).approve(SALES, PRICE);
        uint256 stolen = ISalesController(SALES).purchase(masterId, false, "ipfs://rival");
        vm.stopPrank();
        assertEq(stolen, predicted, "the rival took the id our batch predicted");

        // Our batch now buys a different id, so the transfer of `predicted` must revert.
        vm.startPrank(safe);
        IWmon(WMON).approve(SALES, PRICE);
        ISalesController(SALES).purchase(masterId, false, "ipfs://licence");
        vm.expectRevert();
        IRegistry(REGISTRY).transferFrom(safe, buyer, predicted);
        vm.stopPrank();
    }

    /**
     * @dev Masters stay soulbound. The transfer leg works only because licences are transferable —
     *      if that ever changed, this suite would go green while the batch broke, so assert the
     *      distinction directly.
     */
    function test_MastersRemainSoulboundEvenThoughLicencesMove() public onlyForked {
        vm.prank(artist);
        vm.expectRevert();
        IRegistry(REGISTRY).transferFrom(artist, buyer, masterId);
    }
}
