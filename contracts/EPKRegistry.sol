// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EPKRegistry
 * @notice On-chain EPK (Electronic Press Kit) registry with WMON escrow booking system
 * @dev Artists register EPK metadata (IPFS CID) on-chain. Organizers book artists
 *      with WMON deposits held in escrow until the booking lifecycle completes.
 */
contract EPKRegistry is ReentrancyGuard {
    // ---- State ----
    IERC20 public immutable wmonToken;
    address public owner;

    // ---- EPK Storage ----
    struct EPK {
        string ipfsCid;
        uint256 artistFid;
        uint256 createdAt;
        uint256 updatedAt;
        bool active;
    }

    mapping(address => EPK) public artistEPKs;
    address[] public registeredArtists;

    // ---- Booking & Escrow ----
    enum BookingStatus { PENDING, CONFIRMED, COMPLETED, CANCELLED, REFUNDED }

    struct Booking {
        address organizer;
        address artist;
        uint256 depositAmount;
        string eventDetails; // IPFS CID of event details JSON
        BookingStatus status;
        uint256 createdAt;
    }

    mapping(uint256 => Booking) public bookings;
    uint256 public bookingCounter;

    // ---- Events ----
    event EPKCreated(address indexed artist, uint256 indexed artistFid, string ipfsCid);
    event EPKUpdated(address indexed artist, string ipfsCid);
    event EPKDeactivated(address indexed artist);

    event BookingCreated(
        uint256 indexed bookingId,
        address indexed organizer,
        address indexed artist,
        uint256 depositAmount,
        string eventDetailsCid
    );
    event BookingConfirmed(uint256 indexed bookingId, address indexed artist);
    event BookingCompleted(uint256 indexed bookingId, uint256 depositReleased);
    event BookingRefunded(uint256 indexed bookingId, uint256 amountRefunded);
    event BookingCancelled(uint256 indexed bookingId);

    // ---- Errors ----
    error OnlyOwner();
    error OnlyArtist();
    error OnlyOrganizer();
    error EPKAlreadyExists();
    error EPKDoesNotExist();
    error EPKNotActive();
    error InvalidCID();
    error InvalidDeposit();
    error InvalidBooking();
    error InvalidStatus();
    error TransferFailed();

    // ---- Modifiers ----
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _wmonToken) {
        wmonToken = IERC20(_wmonToken);
        owner = msg.sender;
    }

    // =============================================
    // EPK FUNCTIONS
    // =============================================

    /**
     * @notice Create a new EPK for the calling artist
     * @param ipfsCid IPFS CID containing the full EPK metadata JSON
     * @param artistFid Farcaster ID of the artist
     */
    function createEPK(string calldata ipfsCid, uint256 artistFid) external {
        if (bytes(ipfsCid).length == 0) revert InvalidCID();
        if (artistEPKs[msg.sender].createdAt != 0) revert EPKAlreadyExists();

        artistEPKs[msg.sender] = EPK({
            ipfsCid: ipfsCid,
            artistFid: artistFid,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            active: true
        });

        registeredArtists.push(msg.sender);

        emit EPKCreated(msg.sender, artistFid, ipfsCid);
    }

    /**
     * @notice Update an existing EPK's IPFS CID
     * @param ipfsCid New IPFS CID with updated metadata
     */
    function updateEPK(string calldata ipfsCid) external {
        if (bytes(ipfsCid).length == 0) revert InvalidCID();
        EPK storage epk = artistEPKs[msg.sender];
        if (epk.createdAt == 0) revert EPKDoesNotExist();

        epk.ipfsCid = ipfsCid;
        epk.updatedAt = block.timestamp;
        epk.active = true;

        emit EPKUpdated(msg.sender, ipfsCid);
    }

    /**
     * @notice Deactivate an EPK (artist can re-activate by calling updateEPK)
     */
    function deactivateEPK() external {
        EPK storage epk = artistEPKs[msg.sender];
        if (epk.createdAt == 0) revert EPKDoesNotExist();

        epk.active = false;
        emit EPKDeactivated(msg.sender);
    }

    // =============================================
    // BOOKING FUNCTIONS
    // =============================================

    /**
     * @notice Create a booking request with WMON deposit escrow
     * @param artist Address of the artist to book
     * @param depositAmount Amount of WMON to deposit as escrow
     * @param eventDetailsCid IPFS CID of event details JSON
     */
    function createBooking(
        address artist,
        uint256 depositAmount,
        string calldata eventDetailsCid
    ) external nonReentrant {
        if (depositAmount == 0) revert InvalidDeposit();
        EPK storage epk = artistEPKs[artist];
        if (epk.createdAt == 0) revert EPKDoesNotExist();
        if (!epk.active) revert EPKNotActive();

        // Transfer WMON from organizer to this contract (escrow)
        bool success = wmonToken.transferFrom(msg.sender, address(this), depositAmount);
        if (!success) revert TransferFailed();

        uint256 bookingId = bookingCounter++;

        bookings[bookingId] = Booking({
            organizer: msg.sender,
            artist: artist,
            depositAmount: depositAmount,
            eventDetails: eventDetailsCid,
            status: BookingStatus.PENDING,
            createdAt: block.timestamp
        });

        emit BookingCreated(bookingId, msg.sender, artist, depositAmount, eventDetailsCid);
    }

    /**
     * @notice Artist confirms a pending booking
     * @param bookingId ID of the booking to confirm
     */
    function confirmBooking(uint256 bookingId) external {
        Booking storage booking = bookings[bookingId];
        if (booking.createdAt == 0) revert InvalidBooking();
        if (booking.artist != msg.sender) revert OnlyArtist();
        if (booking.status != BookingStatus.PENDING) revert InvalidStatus();

        booking.status = BookingStatus.CONFIRMED;

        emit BookingConfirmed(bookingId, msg.sender);
    }

    /**
     * @notice Artist marks booking as complete, releasing WMON deposit to artist
     * @param bookingId ID of the booking to complete
     */
    function completeBooking(uint256 bookingId) external nonReentrant {
        Booking storage booking = bookings[bookingId];
        if (booking.createdAt == 0) revert InvalidBooking();
        if (booking.artist != msg.sender) revert OnlyArtist();
        if (booking.status != BookingStatus.CONFIRMED) revert InvalidStatus();

        booking.status = BookingStatus.COMPLETED;
        uint256 amount = booking.depositAmount;

        // Release escrowed WMON to artist
        bool success = wmonToken.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();

        emit BookingCompleted(bookingId, amount);
    }

    /**
     * @notice Organizer requests refund for a pending (unconfirmed) booking
     * @param bookingId ID of the booking to refund
     */
    function requestRefund(uint256 bookingId) external nonReentrant {
        Booking storage booking = bookings[bookingId];
        if (booking.createdAt == 0) revert InvalidBooking();
        if (booking.organizer != msg.sender) revert OnlyOrganizer();
        if (booking.status != BookingStatus.PENDING) revert InvalidStatus();

        booking.status = BookingStatus.REFUNDED;
        uint256 amount = booking.depositAmount;

        // Return escrowed WMON to organizer
        bool success = wmonToken.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();

        emit BookingRefunded(bookingId, amount);
    }

    /**
     * @notice Artist cancels a confirmed booking, returning deposit to organizer
     * @param bookingId ID of the booking to cancel
     */
    function cancelBooking(uint256 bookingId) external nonReentrant {
        Booking storage booking = bookings[bookingId];
        if (booking.createdAt == 0) revert InvalidBooking();
        if (booking.artist != msg.sender) revert OnlyArtist();
        if (booking.status != BookingStatus.CONFIRMED) revert InvalidStatus();

        booking.status = BookingStatus.CANCELLED;
        uint256 amount = booking.depositAmount;

        // Return escrowed WMON to organizer
        bool success = wmonToken.transfer(booking.organizer, amount);
        if (!success) revert TransferFailed();

        emit BookingCancelled(bookingId);
    }

    // =============================================
    // VIEW FUNCTIONS
    // =============================================

    /**
     * @notice Get the number of registered artists
     */
    function getRegisteredArtistCount() external view returns (uint256) {
        return registeredArtists.length;
    }

    /**
     * @notice Check if an address has an active EPK
     */
    function hasActiveEPK(address artist) external view returns (bool) {
        EPK storage epk = artistEPKs[artist];
        return epk.createdAt != 0 && epk.active;
    }

    /**
     * @notice Get booking details
     */
    function getBooking(uint256 bookingId) external view returns (
        address organizer,
        address artist,
        uint256 depositAmount,
        string memory eventDetails,
        BookingStatus status,
        uint256 createdAt
    ) {
        Booking storage b = bookings[bookingId];
        return (b.organizer, b.artist, b.depositAmount, b.eventDetails, b.status, b.createdAt);
    }

    // =============================================
    // ADMIN
    // =============================================

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
