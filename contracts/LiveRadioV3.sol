// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

/**
 * @title LiveRadioV3
 * @notice Decentralized jukebox radio for World Cup 2026
 * @author EmpowerTours
 *
 * @dev V3 Changes from V2:
 * - Replaced hardcoded TOURS reward constants with ToursRewardManager
 * - Rewards distributed directly via ToursRewardManager (no more pending/claim pattern)
 * - Contract no longer holds TOURS tokens (all TOURS in RewardManager)
 * - Added try/catch for reward distribution (heartbeat succeeds even if rewards fail)
 * - Added setRewardManager for upgradability
 *
 * Previous V2 Changes:
 * - Authorized operators for markSongPlayed/markVoiceNotePlayed
 * - DAO timelock support
 * - Emergency pause
 *
 * === FEATURES ===
 * - Random song selection using Pyth Entropy
 * - User queue requests (free for license holders, paid for others)
 * - Voice note shoutouts (0.5 WMON for 3-5 sec, 2 WMON for 30 sec ad)
 * - TOURS rewards via ToursRewardManager (halving schedule)
 * - Streak bonuses for consecutive listening days
 * - First listener bonus per day
 * - Queue tip jar for extra artist payments
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

interface IToursRewardManager {
    enum RewardType {
        LISTEN,
        VOICE_NOTE,
        FIRST_LISTEN,
        STREAK_7,
        ITINERARY_COMPLETE,
        TOUR_GUIDE_COMPLETE,
        QUEST,
        ARTIST_MONTHLY,
        CLIMB_JOURNAL
    }

    function getCurrentReward(RewardType rewardType) external view returns (uint256);
    function distributeReward(address recipient, RewardType rewardType) external returns (uint256);
    function distributeRewardWithMultiplier(address recipient, RewardType rewardType, uint256 multiplierBps) external returns (uint256);
}

contract LiveRadioV3 is Ownable, ReentrancyGuard, IEntropyConsumer {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================
    uint256 public constant QUEUE_PRICE_NO_LICENSE = 1 ether;
    uint256 public constant VOICE_NOTE_PRICE = 0.5 ether;
    uint256 public constant VOICE_AD_PRICE = 2 ether;
    uint256 public constant MAX_VOICE_NOTE_SECONDS = 5;
    uint256 public constant MAX_VOICE_AD_SECONDS = 30;

    uint256 public constant ARTIST_SHARE_BPS = 7000;
    uint256 public constant PLATFORM_SAFE_BPS = 1500;
    uint256 public constant PLATFORM_WALLET_BPS = 1500;
    uint256 public constant BASIS_POINTS = 10000;

    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============================================
    // Configuration
    // ============================================
    IERC20 public wmonToken;
    IToursRewardManager public rewardManager;        // V3: Replaces toursToken
    IEntropyV2 public entropy;
    IEmpowerToursNFT public nftContract;
    address public platformSafe;
    address public platformWallet;
    address public entropyProvider;

    // Fee tracking
    uint256 public platformSafeFeesCollected;
    uint256 public platformWalletFeesCollected;

    // ============================================
    // Authorization State
    // ============================================
    mapping(address => bool) public authorizedOperators;
    address public platformOperator;
    address public daoTimelock;
    bool public paused;

    // ============================================
    // Radio State
    // ============================================
    bool public isLive;
    uint256 public currentDay;
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
        uint256 tipAmount;
        bool played;
    }

    struct VoiceNote {
        uint256 id;
        address submitter;
        uint256 submitterFid;
        string ipfsHash;
        uint256 duration;
        string message;
        uint256 paidAmount;
        bool isAd;
        bool played;
        uint256 createdAt;
    }

    QueuedSong[] public songQueue;
    VoiceNote[] public voiceNotes;
    uint256 public queueHead;
    uint256 public voiceNoteHead;

    // Random song pool
    uint256[] public songPool;
    mapping(uint256 => bool) public inSongPool;

    // ============================================
    // Listener Tracking
    // ============================================
    struct ListenerStats {
        uint256 totalSongsListened;
        uint256 totalRewardsEarned;
        uint256 lastListenDay;
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 voiceNotesSubmitted;
        uint256 voiceNotesPlayed;
        bool claimedFirstListenerToday;
    }

    mapping(address => ListenerStats) public listenerStats;

    // ============================================
    // Pyth Entropy
    // ============================================
    struct RandomnessRequest {
        uint256 requestType;
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
    event RandomSongRequested(uint64 indexed sequenceNumber, address indexed requester);
    event RandomSongSelected(uint256 indexed masterTokenId, bytes32 randomValue);
    event SongAddedToPool(uint256 indexed masterTokenId);
    event SongRemovedFromPool(uint256 indexed masterTokenId);

    // V2/V3 Events
    event PlatformOperatorUpdated(address indexed operator);
    event AuthorizedOperatorUpdated(address indexed operator, bool authorized);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event RewardManagerUpdated(address indexed oldManager, address indexed newManager);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============================================
    // Modifiers
    // ============================================

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier onlyOwnerOrDAO() {
        require(
            msg.sender == owner() || msg.sender == daoTimelock,
            "Only owner or DAO"
        );
        _;
    }

    modifier onlyAuthorizedOperator() {
        require(
            authorizedOperators[msg.sender] || msg.sender == owner(),
            "Not authorized operator"
        );
        _;
    }

    // ============================================
    // Constructor
    // ============================================
    constructor(
        address _wmonToken,
        address _rewardManager,
        address _entropy,
        address _nftContract,
        address _platformSafe,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_wmonToken != address(0), "Invalid WMON");
        require(_rewardManager != address(0), "Invalid RewardManager");
        require(_entropy != address(0), "Invalid Entropy");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_platformSafe != address(0), "Invalid platform safe");
        require(_platformWallet != address(0), "Invalid platform wallet");

        wmonToken = IERC20(_wmonToken);
        rewardManager = IToursRewardManager(_rewardManager);
        entropy = IEntropyV2(_entropy);
        nftContract = IEmpowerToursNFT(_nftContract);
        platformSafe = _platformSafe;
        platformWallet = _platformWallet;

        entropyProvider = entropy.getDefaultProvider();
        currentDay = block.timestamp / SECONDS_PER_DAY;

        // Owner is default operator
        authorizedOperators[msg.sender] = true;
    }

    // ============================================
    // Authorization Management
    // ============================================

    function setPlatformOperator(address operator) external onlyOwner {
        platformOperator = operator;
        emit PlatformOperatorUpdated(operator);
    }

    function registerOperator(address operator) external {
        require(msg.sender == platformOperator || msg.sender == owner(), "Only platform operator");
        authorizedOperators[operator] = true;
        emit AuthorizedOperatorUpdated(operator, true);
    }

    function removeOperator(address operator) external onlyOwnerOrDAO {
        authorizedOperators[operator] = false;
        emit AuthorizedOperatorUpdated(operator, false);
    }

    function setDAOTimelock(address _daoTimelock) external onlyOwner {
        address oldTimelock = daoTimelock;
        daoTimelock = _daoTimelock;
        emit DAOTimelockUpdated(oldTimelock, _daoTimelock);
    }

    function pause() external onlyOwnerOrDAO {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwnerOrDAO {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============================================
    // V3: Reward Manager
    // ============================================

    function setRewardManager(address _rewardManager) external onlyOwnerOrDAO {
        require(_rewardManager != address(0), "Invalid address");
        address old = address(rewardManager);
        rewardManager = IToursRewardManager(_rewardManager);
        emit RewardManagerUpdated(old, _rewardManager);
    }

    // ============================================
    // Queue Song
    // ============================================

    function queueSong(
        uint256 masterTokenId,
        uint256 userFid,
        uint256 tipAmount
    ) external nonReentrant whenNotPaused {
        require(isLive, "Radio not live");
        require(masterTokenId > 0, "Invalid token ID");

        bool hasLicense = nftContract.hasValidLicense(msg.sender, masterTokenId);
        uint256 paymentRequired = hasLicense ? 0 : QUEUE_PRICE_NO_LICENSE;
        uint256 totalPayment = paymentRequired + tipAmount;

        if (totalPayment > 0) {
            wmonToken.safeTransferFrom(msg.sender, address(this), totalPayment);
        }

        (uint256 artistFid, address artist, , , , , , , , , bool active, ,) = nftContract.masterTokens(masterTokenId);
        require(active, "Song not active");

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

        if (tipAmount > 0) {
            wmonToken.safeTransfer(artist, tipAmount);
            emit TipReceived(masterTokenId, artist, msg.sender, tipAmount);
        }

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

    function submitVoiceNote(
        string calldata ipfsHash,
        uint256 duration,
        string calldata message,
        uint256 userFid
    ) external nonReentrant whenNotPaused {
        require(isLive, "Radio not live");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(duration > 0 && duration <= MAX_VOICE_NOTE_SECONDS, "Invalid duration");

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

    function submitVoiceAd(
        string calldata ipfsHash,
        string calldata message,
        uint256 userFid
    ) external nonReentrant whenNotPaused {
        require(isLive, "Radio not live");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

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
    // Listener Heartbeat & Rewards (V3: Direct Distribution)
    // ============================================

    /**
     * @notice Record a listening heartbeat and distribute TOURS rewards directly
     * @dev V3: Rewards go directly from ToursRewardManager to the listener.
     *      Uses try/catch so heartbeat succeeds even if reward distribution fails
     *      (e.g., daily cap reached, manager paused, or insufficient balance).
     */
    function recordHeartbeat(uint256 masterTokenId) external nonReentrant whenNotPaused {
        require(isLive, "Radio not live");

        ListenerStats storage stats = listenerStats[msg.sender];
        uint256 today = block.timestamp / SECONDS_PER_DAY;

        if (today > currentDay) {
            currentDay = today;
            firstListenerOfDay = address(0);
        }

        // First listener bonus
        if (firstListenerOfDay == address(0)) {
            firstListenerOfDay = msg.sender;
            stats.claimedFirstListenerToday = true;

            try rewardManager.distributeReward(msg.sender, IToursRewardManager.RewardType.FIRST_LISTEN) returns (uint256 bonus) {
                totalListenRewardsPaid += bonus;
                stats.totalRewardsEarned += bonus;
                emit FirstListenerBonus(msg.sender, today, bonus);
            } catch {
                emit FirstListenerBonus(msg.sender, today, 0);
            }
        }

        // Streak tracking
        if (stats.lastListenDay == today - 1) {
            stats.currentStreak++;
            if (stats.currentStreak == 7) {
                try rewardManager.distributeReward(msg.sender, IToursRewardManager.RewardType.STREAK_7) returns (uint256 streakBonus) {
                    totalListenRewardsPaid += streakBonus;
                    stats.totalRewardsEarned += streakBonus;
                    emit StreakBonusClaimed(msg.sender, 7, streakBonus);
                } catch {
                    emit StreakBonusClaimed(msg.sender, 7, 0);
                }
            }
        } else if (stats.lastListenDay < today - 1) {
            stats.currentStreak = 1;
        }

        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }

        stats.lastListenDay = today;
        stats.totalSongsListened++;

        // Listen reward
        try rewardManager.distributeReward(msg.sender, IToursRewardManager.RewardType.LISTEN) returns (uint256 listenReward) {
            stats.totalRewardsEarned += listenReward;
            totalListenRewardsPaid += listenReward;
            emit ListenerRewarded(msg.sender, listenReward, "LISTEN");
        } catch {
            emit ListenerRewarded(msg.sender, 0, "LISTEN");
        }
    }

    // ============================================
    // Random Song Selection (Pyth Entropy)
    // ============================================

    function requestRandomSong() external payable nonReentrant whenNotPaused {
        require(isLive, "Radio not live");
        require(songPool.length > 0, "No songs in pool");

        uint256 fee = entropy.getFeeV2();

        uint64 sequenceNumber;
        if (msg.value >= fee) {
            sequenceNumber = entropy.requestV2{value: fee}();

            if (msg.value > fee) {
                (bool success, ) = msg.sender.call{value: msg.value - fee}("");
                require(success, "Refund failed");
            }
        } else {
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

    function entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) internal override {
        RandomnessRequest memory req = randomnessRequests[sequenceNumber];
        require(req.requestType != 0, "Invalid sequence");

        if (req.requestType == 1 && songPool.length > 0) {
            uint256 randomIndex = uint256(randomNumber) % songPool.length;
            lastRandomSongIndex = randomIndex;
            uint256 masterTokenId = songPool[randomIndex];

            totalSongsPlayed++;

            (, address artist, , , , , , , , , , ,) = nftContract.masterTokens(masterTokenId);

            emit RandomSongSelected(masterTokenId, randomNumber);
            emit SongPlayed(0, masterTokenId, artist, 0, true);
        }

        delete randomnessRequests[sequenceNumber];
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ============================================
    // Admin: Play Management (Authorized Operators)
    // ============================================

    function markSongPlayed(uint256 queueIndex) external onlyAuthorizedOperator {
        require(queueIndex < songQueue.length, "Invalid index");
        QueuedSong storage song = songQueue[queueIndex];
        require(!song.played, "Already played");

        song.played = true;
        totalSongsPlayed++;

        (, address artist, , , , , , , , , , ,) = nftContract.masterTokens(song.masterTokenId);

        emit SongPlayed(song.id, song.masterTokenId, artist, 0, false);
    }

    /**
     * @notice Mark a voice note as played and distribute reward via RewardManager
     * @dev V3: Reward goes directly from ToursRewardManager to the submitter
     */
    function markVoiceNotePlayed(uint256 noteIndex) external onlyAuthorizedOperator {
        require(noteIndex < voiceNotes.length, "Invalid index");
        VoiceNote storage note = voiceNotes[noteIndex];
        require(!note.played, "Already played");

        note.played = true;
        listenerStats[note.submitter].voiceNotesPlayed++;

        uint256 rewardPaid = 0;
        try rewardManager.distributeReward(note.submitter, IToursRewardManager.RewardType.VOICE_NOTE) returns (uint256 reward) {
            rewardPaid = reward;
            totalVoiceNoteRewardsPaid += reward;
        } catch {}

        emit VoiceNotePlayed(note.id, note.submitter, rewardPaid);
    }

    // ============================================
    // Admin: Song Pool Management
    // ============================================

    function addToSongPool(uint256 masterTokenId) external onlyAuthorizedOperator {
        require(!inSongPool[masterTokenId], "Already in pool");

        (, , , , , , , , , , bool active, ,) = nftContract.masterTokens(masterTokenId);
        require(active, "Song not active");

        songPool.push(masterTokenId);
        inSongPool[masterTokenId] = true;

        emit SongAddedToPool(masterTokenId);
    }

    function removeFromSongPool(uint256 masterTokenId) external onlyAuthorizedOperator {
        require(inSongPool[masterTokenId], "Not in pool");

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

    function batchAddToSongPool(uint256[] calldata masterTokenIds) external onlyAuthorizedOperator {
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

    function startRadio() external onlyOwnerOrDAO {
        isLive = true;
        currentDay = block.timestamp / SECONDS_PER_DAY;
        firstListenerOfDay = address(0);
        emit RadioStarted(block.timestamp);
    }

    function stopRadio() external onlyOwnerOrDAO {
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
     * @notice Emergency withdraw WMON and native tokens only
     * @dev V3: Contract no longer holds TOURS (all TOURS in RewardManager)
     */
    function emergencyWithdraw() external onlyOwner {
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

    /**
     * @notice Get current reward rates from ToursRewardManager
     * @dev V3: Reads live rates (subject to halving schedule)
     */
    function getCurrentRewardRates() external view returns (
        uint256 listenReward,
        uint256 voiceNoteReward,
        uint256 firstListenerBonus,
        uint256 streakBonus7Days
    ) {
        return (
            rewardManager.getCurrentReward(IToursRewardManager.RewardType.LISTEN),
            rewardManager.getCurrentReward(IToursRewardManager.RewardType.VOICE_NOTE),
            rewardManager.getCurrentReward(IToursRewardManager.RewardType.FIRST_LISTEN),
            rewardManager.getCurrentReward(IToursRewardManager.RewardType.STREAK_7)
        );
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
