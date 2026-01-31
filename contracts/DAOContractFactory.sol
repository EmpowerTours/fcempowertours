// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";

interface IDeploymentNFT {
    function mint(
        address to,
        uint256 proposalId,
        string calldata prompt,
        string calldata ipfsCodeHash,
        address deployedContract
    ) external returns (uint256);
}

/**
 * @title DAOContractFactory
 * @notice Bridges DAO governance to the Claude code generation pipeline.
 *         Proposals go through: Pending → Approved → CodeGenerated → Compiled → Deployed.
 *         Only the Timelock (via Governor vote) can deploy and allocate treasury.
 *
 *         Features:
 *         - 100 MON proposal fee (50/50 split: feeRecipient + treasury)
 *         - Random 10-100 TOURS reward per proposal via Pyth Entropy
 *         - Security integrity hashes (source + bytecode SHA-256)
 *         - Single-write bytecode guard
 *         - EIP-170 bytecode size limit enforcement
 */
contract DAOContractFactory is Ownable, ReentrancyGuard, IEntropyConsumer {

    // ============================================
    // Enums & Structs
    // ============================================

    enum ProposalStatus {
        Pending,
        Approved,
        CodeGenerated,
        Compiled,
        Deployed
    }

    struct DeploymentProposal {
        uint256 governorProposalId;
        address proposer;
        string prompt;
        string ipfsCodeHash;
        bytes compiledBytecode;
        bytes constructorArgs;
        uint256 treasuryAllocation; // basis points (max 500 = 5%)
        address deployedContract;
        uint256 deploymentNftId;
        ProposalStatus status;
        uint256 createdAt;
        uint256 deployedAt;
        // Security fields
        bytes32 sourceCodeHash;
        bytes32 bytecodeHash;
        bool bytecodeSet;       // single-write guard
        uint256 securityScore;  // 0-100, recorded by operator
    }

    struct RewardRequest {
        address proposer;
        uint256 proposalId;
    }

    // ============================================
    // State
    // ============================================

    address public timelock;
    address public operator; // backend operator for setting code/bytecode
    IERC20 public toursToken;
    IDeploymentNFT public deploymentNFT;
    address public treasury;

    // Pyth Entropy for random TOURS rewards
    IEntropyV2 public entropy;
    address public entropyProvider;

    // Fee system
    uint256 public proposalFee = 100 ether; // 100 MON, owner-adjustable
    address public feeRecipient;             // deployer wallet for API costs

    // TOURS reward range
    uint256 public constant MIN_REWARD = 10 ether;   // 10 TOURS
    uint256 public constant MAX_REWARD = 100 ether;   // 100 TOURS

    uint256 public proposalCount;
    mapping(uint256 => DeploymentProposal) public proposals;
    mapping(uint64 => RewardRequest) public rewardRequests;

    uint256 public constant MAX_TREASURY_ALLOCATION_BPS = 500; // 5% max per proposal
    uint256 public constant MAX_BYTECODE_SIZE = 24576;          // EIP-170

    // ============================================
    // Events
    // ============================================

    event ProposalRegistered(uint256 indexed id, address indexed proposer, string prompt, uint256 treasuryAllocation);
    event GovernorProposalLinked(uint256 indexed id, uint256 indexed governorProposalId);
    event CodeGenerated(uint256 indexed id, string ipfsCID);
    event BytecodeCompiled(uint256 indexed id);
    event ContractDeployed(uint256 indexed id, address indexed deployedContract, uint256 nftId);
    event TreasuryAllocated(uint256 indexed id, address indexed recipient, uint256 amount);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event IntegrityHashesSet(uint256 indexed id, bytes32 sourceHash, bytes32 bytecodeHash);
    event RewardDistributed(uint256 indexed id, address indexed proposer, uint256 amount);
    event ProposalFeeUpdated(uint256 oldFee, uint256 newFee);

    // ============================================
    // Modifiers
    // ============================================

    modifier onlyTimelock() {
        require(msg.sender == timelock, "Only timelock");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner(), "Only operator");
        _;
    }

    // ============================================
    // Constructor
    // ============================================

    constructor(
        address _timelock,
        address _operator,
        address _toursToken,
        address _deploymentNFT,
        address _treasury,
        address _entropy,
        address _feeRecipient
    ) Ownable(msg.sender) {
        timelock = _timelock;
        operator = _operator;
        toursToken = IERC20(_toursToken);
        deploymentNFT = IDeploymentNFT(_deploymentNFT);
        treasury = _treasury;
        entropy = IEntropyV2(_entropy);
        entropyProvider = entropy.getDefaultProvider();
        feeRecipient = _feeRecipient;
    }

    // ============================================
    // Public Functions
    // ============================================

    /**
     * @notice Register a new deployment proposal. Requires 100 MON fee.
     *         Fee is split 50/50 between feeRecipient and treasury.
     *         Requests a random TOURS reward via Pyth Entropy.
     * @param prompt Natural language description of what to build
     * @param treasuryAllocation Basis points of treasury to allocate (max 500 = 5%)
     * @return id The proposal ID
     */
    function registerProposal(
        string calldata prompt,
        uint256 treasuryAllocation
    ) external payable returns (uint256 id) {
        require(bytes(prompt).length >= 10, "Prompt too short");
        require(treasuryAllocation <= MAX_TREASURY_ALLOCATION_BPS, "Treasury allocation exceeds 5% cap");
        require(msg.value >= proposalFee, "Insufficient MON fee");

        // Split fee 50/50
        uint256 half = msg.value / 2;
        payable(feeRecipient).transfer(half);
        payable(treasury).transfer(msg.value - half);

        id = proposalCount++;
        DeploymentProposal storage p = proposals[id];
        p.proposer = msg.sender;
        p.prompt = prompt;
        p.treasuryAllocation = treasuryAllocation;
        p.status = ProposalStatus.Pending;
        p.createdAt = block.timestamp;

        emit ProposalRegistered(id, msg.sender, prompt, treasuryAllocation);

        // Request random TOURS reward via Pyth Entropy
        _requestReward(msg.sender, id);
    }

    /**
     * @notice Link a Governor proposal ID to a factory proposal.
     * @param id Factory proposal ID
     * @param governorProposalId The Governor proposal ID
     */
    function linkGovernorProposal(uint256 id, uint256 governorProposalId) external onlyOperator {
        DeploymentProposal storage p = proposals[id];
        require(p.status == ProposalStatus.Pending, "Not pending");
        p.governorProposalId = governorProposalId;
        p.status = ProposalStatus.Approved;

        emit GovernorProposalLinked(id, governorProposalId);
    }

    /**
     * @notice Backend operator sets generated code IPFS CID after Claude generates.
     * @param id Factory proposal ID
     * @param ipfsCID IPFS content identifier for the generated code
     */
    function setGeneratedCode(uint256 id, string calldata ipfsCID) external onlyOperator {
        DeploymentProposal storage p = proposals[id];
        require(
            p.status == ProposalStatus.Approved || p.status == ProposalStatus.Pending,
            "Invalid status for code generation"
        );
        require(bytes(ipfsCID).length > 0, "Empty IPFS CID");

        p.ipfsCodeHash = ipfsCID;
        p.status = ProposalStatus.CodeGenerated;

        emit CodeGenerated(id, ipfsCID);
    }

    /**
     * @notice Set integrity hashes for source code and bytecode. One-time per proposal.
     * @param id Factory proposal ID
     * @param sourceHash SHA-256 of source code
     * @param bytecodeHash SHA-256 of compiled bytecode
     */
    function setIntegrityHashes(
        uint256 id,
        bytes32 sourceHash,
        bytes32 bytecodeHash
    ) external onlyOperator {
        DeploymentProposal storage p = proposals[id];
        require(p.sourceCodeHash == bytes32(0), "Integrity hashes already set");
        require(sourceHash != bytes32(0) && bytecodeHash != bytes32(0), "Invalid hashes");

        p.sourceCodeHash = sourceHash;
        p.bytecodeHash = bytecodeHash;

        emit IntegrityHashesSet(id, sourceHash, bytecodeHash);
    }

    /**
     * @notice Set the security score for a proposal. Only operator.
     * @param id Factory proposal ID
     * @param score Security score (0-100)
     */
    function setSecurityScore(uint256 id, uint256 score) external onlyOperator {
        require(score <= 100, "Score exceeds 100");
        proposals[id].securityScore = score;
    }

    /**
     * @notice Backend operator sets compiled bytecode after Solidity compilation.
     *         Single-write guard: bytecode can only be set once per proposal.
     *         Enforces EIP-170 size limit and bytecode hash verification.
     * @param id Factory proposal ID
     * @param bytecode Compiled contract bytecode
     * @param args ABI-encoded constructor arguments
     */
    function setCompiledBytecode(uint256 id, bytes calldata bytecode, bytes calldata args) external onlyOperator {
        DeploymentProposal storage p = proposals[id];
        require(p.status == ProposalStatus.CodeGenerated, "Code not generated");
        require(!p.bytecodeSet, "Bytecode already set");
        require(bytecode.length > 0, "Empty bytecode");
        require(bytecode.length <= MAX_BYTECODE_SIZE, "Bytecode exceeds EIP-170 limit");

        // Verify bytecode hash if integrity hashes were set
        if (p.bytecodeHash != bytes32(0)) {
            require(keccak256(bytecode) == p.bytecodeHash, "Bytecode hash mismatch");
        }

        p.compiledBytecode = bytecode;
        p.constructorArgs = args;
        p.bytecodeSet = true;
        p.status = ProposalStatus.Compiled;

        emit BytecodeCompiled(id);
    }

    /**
     * @notice Execute deployment — ONLY callable by the Timelock (requires Governor vote).
     *         Re-verifies bytecode hash at deployment time.
     * @param id Factory proposal ID
     */
    function executeApprovedDeployment(uint256 id) external onlyTimelock nonReentrant {
        DeploymentProposal storage p = proposals[id];
        require(p.status == ProposalStatus.Compiled, "Not compiled");

        // Re-verify bytecode hash at deployment time
        if (p.bytecodeHash != bytes32(0)) {
            require(keccak256(p.compiledBytecode) == p.bytecodeHash, "Bytecode hash mismatch at deploy");
        }

        // Deploy the contract
        bytes memory creationCode = abi.encodePacked(p.compiledBytecode, p.constructorArgs);
        address deployed;
        assembly ("memory-safe") {
            deployed := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        require(deployed != address(0), "Deployment failed");

        // Mint provenance NFT
        uint256 nftId = deploymentNFT.mint(
            p.proposer,
            id,
            p.prompt,
            p.ipfsCodeHash,
            deployed
        );

        p.deployedContract = deployed;
        p.deploymentNftId = nftId;
        p.status = ProposalStatus.Deployed;
        p.deployedAt = block.timestamp;

        emit ContractDeployed(id, deployed, nftId);
    }

    /**
     * @notice Allocate treasury funds to a deployed contract — ONLY callable by Timelock.
     * @param id Factory proposal ID
     */
    function allocateTreasury(uint256 id) external onlyTimelock nonReentrant {
        DeploymentProposal storage p = proposals[id];
        require(p.status == ProposalStatus.Deployed, "Not deployed");
        require(p.treasuryAllocation > 0, "No treasury allocation");
        require(p.deployedContract != address(0), "No deployed contract");

        uint256 treasuryBalance = toursToken.balanceOf(treasury);
        uint256 allocation = (treasuryBalance * p.treasuryAllocation) / 10000;

        require(allocation > 0, "Zero allocation");

        // Transfer from treasury (requires treasury to have approved this contract)
        bool success = toursToken.transferFrom(treasury, p.deployedContract, allocation);
        require(success, "Treasury transfer failed");

        emit TreasuryAllocated(id, p.deployedContract, allocation);
    }

    // ============================================
    // Pyth Entropy — TOURS Reward
    // ============================================

    /**
     * @dev Request a random TOURS reward for a proposal submitter.
     */
    function _requestReward(address proposer, uint256 proposalId) internal {
        uint256 fee = entropy.getFeeV2();
        // If factory doesn't have enough for entropy fee, skip reward
        if (address(this).balance < fee) return;

        uint64 seq = entropy.requestV2{value: fee}();
        rewardRequests[seq] = RewardRequest(proposer, proposalId);
    }

    /**
     * @dev Pyth Entropy callback — distributes random TOURS reward.
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address,
        bytes32 randomNumber
    ) internal override {
        RewardRequest memory req = rewardRequests[sequenceNumber];
        if (req.proposer == address(0)) return; // safety check

        uint256 range = MAX_REWARD - MIN_REWARD;
        uint256 reward = MIN_REWARD + (uint256(randomNumber) % range);

        // Transfer from factory's TOURS pool if sufficient balance
        if (toursToken.balanceOf(address(this)) >= reward) {
            toursToken.transfer(req.proposer, reward);
            emit RewardDistributed(req.proposalId, req.proposer, reward);
        }

        delete rewardRequests[sequenceNumber];
    }

    /**
     * @dev Required by IEntropyConsumer — returns the entropy contract address.
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    // ============================================
    // Admin Functions
    // ============================================

    function setOperator(address _operator) external onlyOwner {
        address old = operator;
        operator = _operator;
        emit OperatorUpdated(old, _operator);
    }

    function setProposalFee(uint256 _fee) external onlyOwner {
        uint256 oldFee = proposalFee;
        proposalFee = _fee;
        emit ProposalFeeUpdated(oldFee, _fee);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    /**
     * @notice Fund the factory with TOURS for reward distribution.
     */
    function fundRewardPool(uint256 amount) external {
        require(toursToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    /**
     * @notice Emergency withdraw TOURS from reward pool.
     */
    function withdrawRewardPool(uint256 amount) external onlyOwner {
        require(toursToken.transfer(msg.sender, amount), "Transfer failed");
    }

    // ============================================
    // View Functions
    // ============================================

    function getProposal(uint256 id) external view returns (DeploymentProposal memory) {
        return proposals[id];
    }

    /**
     * @notice Get the entropy fee required for TOURS reward request.
     */
    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2();
    }

    // Allow factory to receive MON for entropy fees
    receive() external payable {}
}
