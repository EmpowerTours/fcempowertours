// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/**
 * @title LiveRadio
 * @notice Decentralized jukebox radio for World Cup 2026
 * @author EmpowerTours
 *
 * === FEATURES ===
 * - Random song selection using Pyth Entropy
 * - User queue requests (free for license holders, paid for others)
 * - Voice note shoutouts (0.5 WMON for 3-5 sec, 2 WMON for 30 sec ad)
 * - TOURS rewards for listening and contributions
 * - Streak bonuses for consecutive listening days
 * - First listener bonus per day
 * - Queue tip jar for extra artist payments
 *
 * === INTEGRATION ===
 * - EmpowerToursNFT for license verification
 * - WMON for payments
 * - TOURS for rewards
 * - Pyth Entropy for verifiable randomness
 */

interface IEmpowerToursNFT {
    function hasValidLicense(address user, uint256 masterTokenId) external view returns (bool);
    function masterTokens(uint256 tokenId) external view returns (
        uint256 artistFid,
        address originalArtist,
        string memory tokenURI,
        string memory collectorTokenURI,
        uint256 price,
        uint256 collectorPrice,
        uint256 totalSold,
        uint256 activeLicenses,
        uint256 maxCollectorEditions,
        uint256 collectorsMinted,
        bool active,
        uint8 nftType,
        uint96 royaltyPercentage
    );
}

interface IWMON is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

contract LiveRadio is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant QUEUE_PRICE_NO_LICENSE = 1 ether;      // 1 WMON if no license
    uint256 public constant VOICE_NOTE_PRICE = 0.5 ether;          // 0.5 WMON for 3-5 sec
    uint256 public constant VOICE_AD_PRICE = 2 ether;              // 2 WMON for 30 sec ad
    uint256 public constant MAX_VOICE_NOTE_SECONDS = 5;
    uint256 public constant MAX_VOICE_AD_SECONDS = 30;

    // TOURS Rewards
    uint256 public constant LISTEN_REWARD_PER_SONG = 0.1 ether;    // 0.1 TOURS per song listened
    uint256 public constant VOICE_NOTE_PLAY_REWARD = 1 ether;      // 1 TOURS when voice note plays
    uint256 public constant FIRST_LISTENER_BONUS = 5 ether;        // 5 TOURS for first listener of day
    uint256 public constant STREAK_BONUS_7_DAYS = 10 ether;        // 10 TOURS for 7-day streak

    uint256 public constant ARTIST_SHARE_BPS = 7000;               // 70% to artist
    uint256 public constant PLATFORM_SAFE_BPS = 1500;              // 15% to treasury/safe
    uint256 public constant PLATFORM_WALLET_BPS = 1500;            // 15% to operational wallet
    uint256 public constant BASIS_POINTS = 10000;

    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============================================
    // Configuration
    // ============================================
    IERC20 public wmonToken;
    IERC20 public toursToken;
    IEntropyV2 public entropy;
    IEmpowerToursNFT public nftContract;
    address public platformSafe;                                    // Treasury/multisig
    address public platformWallet;                                  // Operational wallet
    address public entropyProvider;

    // Fee tracking
    uint256 public platformSafeFeesCollected;
    uint256 public platformWalletFeesCollected;

    // ============================================
    // Radio State
    // ============================================
    bool public isLive;
    uint256 public currentDay;                                      // Day counter for first listener
    address public firstListenerOfDay;
    uint256 public totalSongsPlayed;
    uint256 public totalListenRewardsPaid;
    uint256 public totalVoiceNoteRewardsPaid;

    // ============================================
    // Song Queue
    // ============================================
    struct QueuedSong {
        uint256 id;
        uint256 masterTokenId;
        address queuedBy;
        uint256 queuedByFid;
        uint256 queuedAt;
        uint256 paidAmount;
        uint256 tipAmount;                                          // Extra tip for artist
        bool played;
    }

    struct VoiceNote {
        uint256 id;
        address submitter;
        uint256 submitterFid;
        string ipfsHash;                                            // IPFS hash of audio
        uint256 duration;
        string message;
        uint256 paidAmount;
        bool isAd;                                                  // 30 sec ad vs 5 sec shoutout
        bool played;
        uint256 createdAt;
    }

    QueuedSong[] public songQueue;
    VoiceNote[] public voiceNotes;
    uint256 public queueHead;                                       // Index of next song to play
    uint256 public voiceNoteHead;                                   // Index of next voice note to play

    // Random song pool (master token IDs of active songs)
    uint256[] public songPool;
    mapping(uint256 => bool) public inSongPool;

    // ============================================
    // Listener Tracking
    // ============================================
    struct ListenerStats {
        uint256 totalSongsListened;
        uint256 totalRewardsEarned;
        uint256 lastListenDay;                                      // Day number of last listen
        uint256 currentStreak;                                      // Consecutive days listening
        uint256 longestStreak;
        uint256 voiceNotesSubmitted;
        uint256 voiceNotesPlayed;
        bool claimedFirstListenerToday;
    }

    mapping(address => ListenerStats) public listenerStats;
    mapping(address => uint256) public pendingRewards;              // Unclaimed TOURS rewards

    // ============================================
    // Pyth Entropy
    // ============================================
    struct RandomnessRequest {
        uint256 requestType;                                        // 1 = random song, 2 = random voice note order
        address requester;
        uint256 timestamp;
    }

    mapping(uint64 => RandomnessRequest) public randomnessRequests;
    uint256 public lastRandomSongIndex;

    // ============================================
    // Events
    // ============================================
    event RadioStarted(uint256 timestamp);
    event RadioStopped(uint256 timestamp);
    event SongQueued(
        uint256 indexed queueId,
        uint256 indexed masterTokenId,
        address indexed queuedBy,
        uint256 fid,
        uint256 paidAmount,
        uint256 tipAmount,
        bool hadLicense
    );
    event SongPlayed(
        uint256 indexed queueId,
        uint256 indexed masterTokenId,
        address indexed artist,
        uint256 artistPayout,
        bool wasRandom
    );
    event VoiceNoteSubmitted(
        uint256 indexed noteId,
        address indexed submitter,
        uint256 duration,
        uint256 paidAmount,
        bool isAd
    );
    event VoiceNotePlayed(
        uint256 indexed noteId,
        address indexed submitter,
        uint256 rewardPaid
    );
    event ListenerRewarded(
        address indexed listener,
        uint256 amount,
        string rewardType
    );
    event StreakBonusClaimed(
        address indexed listener,
        uint256 streakDays,
        uint256 bonusAmount
    );
    event FirstListenerBonus(
        address indexed listener,
        uint256 day,
        uint256 bonusAmount
    );
    event TipReceived(
        uint256 indexed masterTokenId,
        address indexed artist,
        address indexed tipper,
        uint256 amount
    );
    event RewardsClaimed(address indexed user, uint256 amount);
    event RandomSongRequested(uint64 indexed sequenceNumber, address indexed requester);
    event RandomSongSelected(uint256 indexed masterTokenId, bytes32 randomValue);
    event SongAddedToPool(uint256 indexed masterTokenId);
    event SongRemovedFromPool(uint256 indexed masterTokenId);

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _toursToken,
        address _entropy,
        address _nftContract,
        address _platformSafe,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_toursToken != address(0), "Invalid TOURS");
        require(_entropy != address(0), "Invalid Entropy");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        toursToken = IERC20(_toursToken);
        entropy = IEntropyV2(_entropy);
        nftContract = IEmpowerToursNFT(_nftContract);
        platformSafe = _platformSafe;
        platformWallet = _platformWallet;

        entropyProvider = entropy.getDefaultProvider();
        currentDay = block.timestamp / SECONDS_PER_DAY;
    }

    // ============================================
    // Queue Song
    // ============================================

    /**
     * @notice Queue a song to play on the radio
     * @param masterTokenId The master token ID of the song
     * @param userFid User's Farcaster ID
     * @param tipAmount Extra WMON tip for the artist (optional)
     */
    function queueSong(
        uint256 masterTokenId,
        uint256 userFid,
        uint256 tipAmount
    ) external nonReentrant {
        require(isLive, "Radio not live");
        require(masterTokenId > 0, "Invalid token ID");

        // Check if user has license (free queue) or needs to pay
        bool hasLicense = nftContract.hasValidLicense(msg.sender, masterTokenId);
        uint256 paymentRequired = hasLicense ? 0 : QUEUE_PRICE_NO_LICENSE;
        uint256 totalPayment = paymentRequired + tipAmount;

        if (totalPayment > 0) {
            wmonToken.safeTransferFrom(msg.sender, address(this), totalPayment);
        }

        // Get artist address for tip distribution
        (uint256 artistFid, address artist, , , , , , , , , bool active, ,) = nftContract.masterTokens(masterTokenId);
        require(active, "Song not active");

        // Distribute queue payment
        if (paymentRequired > 0) {
            uint256 artistShare = (paymentRequired * ARTIST_SHARE_BPS) / BASIS_POINTS;
            uint256 safeShare = (paymentRequired * PLATFORM_SAFE_BPS) / BASIS_POINTS;
            uint256 walletShare = paymentRequired - artistShare - safeShare;

            wmonToken.safeTransfer(artist, artistShare);

            if (safeShare > 0) {
                platformSafeFeesCollected += safeShare;
                wmonToken.safeTransfer(platformSafe, safeShare);
            }
            if (walletShare > 0) {
                platformWalletFeesCollected += walletShare;
                wmonToken.safeTransfer(platformWallet, walletShare);
            }
        }

        // Distribute tip (100% to artist)
        if (tipAmount > 0) {
            wmonToken.safeTransfer(artist, tipAmount);
            emit TipReceived(masterTokenId, artist, msg.sender, tipAmount);
        }

        // Add to queue
        uint256 queueId = songQueue.length;
        songQueue.push(QueuedSong({
            id: queueId,
            masterTokenId: masterTokenId,
            queuedBy: msg.sender,
            queuedByFid: userFid,
            queuedAt: block.timestamp,
            paidAmount: paymentRequired,
            tipAmount: tipAmount,
            played: false
        }));

        emit SongQueued(queueId, masterTokenId, msg.sender, userFid, paymentRequired, tipAmount, hasLicense);
    }

    // ============================================
    // Voice Notes
    // ============================================

    /**
     * @notice Submit a voice note shoutout (3-5 seconds)
     * @param ipfsHash IPFS hash of the audio file
     * @param duration Duration in seconds (max 5)
     * @param message Optional text message
     * @param userFid User's Farcaster ID
     */
    function submitVoiceNote(
        string calldata ipfsHash,
        uint256 duration,
        string calldata message,
        uint256 userFid
    ) external nonReentrant {
        require(isLive, "Radio not live");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(duration > 0 && duration <= MAX_VOICE_NOTE_SECONDS, "Invalid duration");

        // Split payment between Safe and Wallet (50/50 for voice notes)
        wmonToken.safeTransferFrom(msg.sender, address(this), VOICE_NOTE_PRICE);
        _distributeVoiceNoteFee(VOICE_NOTE_PRICE);

        uint256 noteId = voiceNotes.length;
        voiceNotes.push(VoiceNote({
            id: noteId,
            submitter: msg.sender,
            submitterFid: userFid,
            ipfsHash: ipfsHash,
            duration: duration,
            message: message,
            paidAmount: VOICE_NOTE_PRICE,
            isAd: false,
            played: false,
            createdAt: block.timestamp
        }));

        listenerStats[msg.sender].voiceNotesSubmitted++;

        emit VoiceNoteSubmitted(noteId, msg.sender, duration, VOICE_NOTE_PRICE, false);
    }

    /**
     * @notice Submit a 30-second voice ad
     * @param ipfsHash IPFS hash of the audio file
     * @param message Optional text message
     * @param userFid User's Farcaster ID
     */
    function submitVoiceAd(
        string calldata ipfsHash,
        string calldata message,
        uint256 userFid
    ) external nonReentrant {
        require(isLive, "Radio not live");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        // Split payment between Safe and Wallet (50/50 for voice ads)
        wmonToken.safeTransferFrom(msg.sender, address(this), VOICE_AD_PRICE);
        _distributeVoiceNoteFee(VOICE_AD_PRICE);

        uint256 noteId = voiceNotes.length;
        voiceNotes.push(VoiceNote({
            id: noteId,
            submitter: msg.sender,
            submitterFid: userFid,
            ipfsHash: ipfsHash,
            duration: MAX_VOICE_AD_SECONDS,
            message: message,
            paidAmount: VOICE_AD_PRICE,
            isAd: true,
            played: false,
            createdAt: block.timestamp
        }));

        listenerStats[msg.sender].voiceNotesSubmitted++;

        emit VoiceNoteSubmitted(noteId, msg.sender, MAX_VOICE_AD_SECONDS, VOICE_AD_PRICE, true);
    }

    /**
     * @notice Internal helper to distribute voice note fees (50/50 split)
     */
    function _distributeVoiceNoteFee(uint256 amount) internal {
        uint256 safeShare = amount / 2;
        uint256 walletShare = amount - safeShare;

        if (safeShare > 0) {
            platformSafeFeesCollected += safeShare;
            wmonToken.safeTransfer(platformSafe, safeShare);
        }
        if (walletShare > 0) {
            platformWalletFeesCollected += walletShare;
            wmonToken.safeTransfer(platformWallet, walletShare);
        }
    }

    // ============================================
    // Listener Heartbeat & Rewards
    // ============================================

    /**
     * @notice Record a heartbeat (song listened) and earn rewards
     * @param masterTokenId The song being listened to
     */
    function recordHeartbeat(uint256 masterTokenId) external nonReentrant {
        require(isLive, "Radio not live");

        ListenerStats storage stats = listenerStats[msg.sender];
        uint256 today = block.timestamp / SECONDS_PER_DAY;

        // Check for new day
        if (today > currentDay) {
            currentDay = today;
            firstListenerOfDay = address(0);
        }

        // First listener bonus
        if (firstListenerOfDay == address(0)) {
            firstListenerOfDay = msg.sender;
            pendingRewards[msg.sender] += FIRST_LISTENER_BONUS;
            stats.claimedFirstListenerToday = true;
            emit FirstListenerBonus(msg.sender, today, FIRST_LISTENER_BONUS);
        }

        // Update streak
        if (stats.lastListenDay == today - 1) {
            // Consecutive day
            stats.currentStreak++;

            // Check for 7-day streak bonus
            if (stats.currentStreak == 7) {
                pendingRewards[msg.sender] += STREAK_BONUS_7_DAYS;
                emit StreakBonusClaimed(msg.sender, 7, STREAK_BONUS_7_DAYS);
            }
        } else if (stats.lastListenDay < today - 1) {
            // Streak broken, reset
            stats.currentStreak = 1;
        }
        // Same day, no streak change

        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }

        stats.lastListenDay = today;
        stats.totalSongsListened++;

        // Listen reward
        pendingRewards[msg.sender] += LISTEN_REWARD_PER_SONG;
        stats.totalRewardsEarned += LISTEN_REWARD_PER_SONG;
        totalListenRewardsPaid += LISTEN_REWARD_PER_SONG;

        emit ListenerRewarded(msg.sender, LISTEN_REWARD_PER_SONG, "LISTEN");
    }

    /**
     * @notice Claim accumulated TOURS rewards
     */
    function claimRewards() external nonReentrant {
        uint256 rewards = pendingRewards[msg.sender];
        require(rewards > 0, "No rewards to claim");
        require(toursToken.balanceOf(address(this)) >= rewards, "Insufficient TOURS balance");

        pendingRewards[msg.sender] = 0;
        toursToken.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    // ============================================
    // Random Song Selection (Pyth Entropy)
    // ============================================

    /**
     * @notice Request a random song from the pool
     */
    function requestRandomSong() external payable nonReentrant {
        require(isLive, "Radio not live");
        require(songPool.length > 0, "No songs in pool");

        uint256 fee = entropy.getFeeV2();

        uint64 sequenceNumber;
        if (msg.value >= fee) {
            sequenceNumber = entropy.requestV2{value: fee}();

            // Refund excess
            if (msg.value > fee) {
                (bool success, ) = msg.sender.call{value: msg.value - fee}("");
                require(success, "Refund failed");
            }
        } else {
            // Use WMON from contract
            uint256 wmonBalance = wmonToken.balanceOf(address(this));
            require(wmonBalance >= fee, "Insufficient WMON for entropy fee");
            IWMON(address(wmonToken)).withdraw(fee);
            sequenceNumber = entropy.requestV2{value: fee}();
        }

        randomnessRequests[sequenceNumber] = RandomnessRequest({
            requestType: 1,
            requester: msg.sender,
            timestamp: block.timestamp
        });

        emit RandomSongRequested(sequenceNumber, msg.sender);
    }

    /**
     * @notice Pyth Entropy callback
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) internal override {
        RandomnessRequest memory req = randomnessRequests[sequenceNumber];
        require(req.requestType != 0, "Invalid sequence");

        if (req.requestType == 1 && songPool.length > 0) {
            // Select random song
            uint256 randomIndex = uint256(randomNumber) % songPool.length;
            lastRandomSongIndex = randomIndex;
            uint256 masterTokenId = songPool[randomIndex];

            totalSongsPlayed++;

            // Get artist for payout tracking
            (, address artist, , , , , , , , , , ,) = nftContract.masterTokens(masterTokenId);

            emit RandomSongSelected(masterTokenId, randomNumber);
            emit SongPlayed(0, masterTokenId, artist, 0, true);
        }

        delete randomnessRequests[sequenceNumber];
    }

    /**
     * @notice Required by IEntropyConsumer
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ============================================
    // Admin: Play Management
    // ============================================

    /**
     * @notice Mark a queued song as played (called by backend)
     * @param queueIndex Index in the queue
     */
    function markSongPlayed(uint256 queueIndex) external onlyOwner {
        require(queueIndex < songQueue.length, "Invalid index");
        QueuedSong storage song = songQueue[queueIndex];
        require(!song.played, "Already played");

        song.played = true;
        totalSongsPlayed++;

        (, address artist, , , , , , , , , , ,) = nftContract.masterTokens(song.masterTokenId);

        emit SongPlayed(song.id, song.masterTokenId, artist, 0, false);
    }

    /**
     * @notice Mark a voice note as played and reward submitter
     * @param noteIndex Index in voice notes array
     */
    function markVoiceNotePlayed(uint256 noteIndex) external onlyOwner {
        require(noteIndex < voiceNotes.length, "Invalid index");
        VoiceNote storage note = voiceNotes[noteIndex];
        require(!note.played, "Already played");

        note.played = true;

        // Reward submitter
        pendingRewards[note.submitter] += VOICE_NOTE_PLAY_REWARD;
        listenerStats[note.submitter].voiceNotesPlayed++;
        totalVoiceNoteRewardsPaid += VOICE_NOTE_PLAY_REWARD;

        emit VoiceNotePlayed(note.id, note.submitter, VOICE_NOTE_PLAY_REWARD);
    }

    // ============================================
    // Admin: Song Pool Management
    // ============================================

    /**
     * @notice Add a song to the random play pool
     */
    function addToSongPool(uint256 masterTokenId) external onlyOwner {
        require(!inSongPool[masterTokenId], "Already in pool");

        (, , , , , , , , , , bool active, ,) = nftContract.masterTokens(masterTokenId);
        require(active, "Song not active");

        songPool.push(masterTokenId);
        inSongPool[masterTokenId] = true;

        emit SongAddedToPool(masterTokenId);
    }

    /**
     * @notice Remove a song from the random play pool
     */
    function removeFromSongPool(uint256 masterTokenId) external onlyOwner {
        require(inSongPool[masterTokenId], "Not in pool");

        // Find and remove
        for (uint256 i = 0; i < songPool.length; i++) {
            if (songPool[i] == masterTokenId) {
                songPool[i] = songPool[songPool.length - 1];
                songPool.pop();
                break;
            }
        }

        inSongPool[masterTokenId] = false;

        emit SongRemovedFromPool(masterTokenId);
    }

    /**
     * @notice Batch add songs to pool
     */
    function batchAddToSongPool(uint256[] calldata masterTokenIds) external onlyOwner {
        for (uint256 i = 0; i < masterTokenIds.length; i++) {
            uint256 tokenId = masterTokenIds[i];
            if (!inSongPool[tokenId]) {
                (, , , , , , , , , , bool active, ,) = nftContract.masterTokens(tokenId);
                if (active) {
                    songPool.push(tokenId);
                    inSongPool[tokenId] = true;
                    emit SongAddedToPool(tokenId);
                }
            }
        }
    }

    // ============================================
    // Admin: Radio Control
    // ============================================

    function startRadio() external onlyOwner {
        isLive = true;
        currentDay = block.timestamp / SECONDS_PER_DAY;
        firstListenerOfDay = address(0);
        emit RadioStarted(block.timestamp);
    }

    function stopRadio() external onlyOwner {
        isLive = false;
        emit RadioStopped(block.timestamp);
    }

    function setPlatformSafe(address _safe) external onlyOwner {
        require(_safe != address(0), "Invalid address");
        platformSafe = _safe;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        platformWallet = _wallet;
    }

    function setNFTContract(address _nftContract) external onlyOwner {
        require(_nftContract != address(0), "Invalid address");
        nftContract = IEmpowerToursNFT(_nftContract);
    }

    /**
     * @notice Fund contract with TOURS for rewards
     */
    function fundRewards(uint256 amount) external onlyOwner {
        toursToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Emergency withdraw excess tokens
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 toursBalance = toursToken.balanceOf(address(this));
        if (toursBalance > 0) {
            toursToken.safeTransfer(owner(), toursBalance);
        }

        uint256 wmonBalance = wmonToken.balanceOf(address(this));
        if (wmonBalance > 0) {
            wmonToken.safeTransfer(owner(), wmonBalance);
        }

        uint256 nativeBalance = address(this).balance;
        if (nativeBalance > 0) {
            (bool success, ) = owner().call{value: nativeBalance}("");
            require(success, "Native transfer failed");
        }
    }

    // ============================================
    // View Functions
    // ============================================

    function getQueueLength() external view returns (uint256) {
        return songQueue.length - queueHead;
    }

    function getQueue(uint256 offset, uint256 limit) external view returns (QueuedSong[] memory) {
        uint256 start = queueHead + offset;
        uint256 end = start + limit;
        if (end > songQueue.length) end = songQueue.length;

        QueuedSong[] memory result = new QueuedSong[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = songQueue[i];
        }
        return result;
    }

    function getVoiceNotes(uint256 offset, uint256 limit) external view returns (VoiceNote[] memory) {
        uint256 start = voiceNoteHead + offset;
        uint256 end = start + limit;
        if (end > voiceNotes.length) end = voiceNotes.length;

        VoiceNote[] memory result = new VoiceNote[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = voiceNotes[i];
        }
        return result;
    }

    function getSongPoolLength() external view returns (uint256) {
        return songPool.length;
    }

    function getSongPool() external view returns (uint256[] memory) {
        return songPool;
    }

    function getListenerStats(address user) external view returns (ListenerStats memory) {
        return listenerStats[user];
    }

    function getPendingRewards(address user) external view returns (uint256) {
        return pendingRewards[user];
    }

    function getRadioStats() external view returns (
        bool _isLive,
        uint256 _totalSongsPlayed,
        uint256 _queueLength,
        uint256 _voiceNotesCount,
        uint256 _songPoolSize,
        uint256 _totalListenRewards,
        uint256 _totalVoiceNoteRewards
    ) {
        return (
            isLive,
            totalSongsPlayed,
            songQueue.length - queueHead,
            voiceNotes.length - voiceNoteHead,
            songPool.length,
            totalListenRewardsPaid,
            totalVoiceNoteRewardsPaid
        );
    }

    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    function hasLicenseForSong(address user, uint256 masterTokenId) external view returns (bool) {
        return nftContract.hasValidLicense(user, masterTokenId);
    }

    receive() external payable {}
}
