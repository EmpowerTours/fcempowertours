// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IAgentMusicNFT
 * @notice Interface for AgentMusicNFT contract to check breeding eligibility
 */
interface IAgentMusicNFT {
    function canBreed(address agent1, address agent2) external view returns (bool eligible, uint256 score);
    function mutualAppreciation(address agent1, address agent2) external view returns (uint256);
}

/**
 * @title AgentBreeding
 * @notice Breeding contract for AI agents based on mutual music appreciation
 * @author EmpowerTours
 *
 * @dev Key features:
 * - Breeds two AI agents when mutual music appreciation > 70%
 * - Creates BabyAgent NFTs with blended traits from parents
 * - Costs EMPTOURS to breed
 * - Rewards TOURS to both parents
 * - Tracks generations (parents = gen 0, babies = gen 1, etc.)
 *
 * === BREEDING MECHANICS ===
 * 1. Two agents develop mutual appreciation through music
 * 2. When both appreciate each other > 70%, breeding is unlocked
 * 3. Initiator pays EMPTOURS breeding cost
 * 4. Baby agent minted with blended traits
 * 5. Both parents receive TOURS rewards
 */
contract AgentBreeding is ERC721URIStorage, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // State Variables
    // ============================================

    uint256 private _babyIdCounter;

    /// @notice AgentMusicNFT contract for checking breeding eligibility
    IAgentMusicNFT public agentMusicNFT;

    /// @notice EMPTOURS token for breeding costs
    IERC20 public emptours;

    /// @notice TOURS token for breeding rewards
    IERC20 public tours;

    /// @notice Protocol treasury
    address public treasury;

    /// @notice Breeding cost in EMPTOURS (default 100 EMPTOURS)
    uint256 public breedingCost = 100 ether;

    /// @notice Breeding reward per parent in TOURS (default 20 TOURS)
    uint256 public breedingReward = 20 ether;

    /// @notice Minimum mutual appreciation required for breeding (70%)
    uint256 public constant BREEDING_THRESHOLD = 70;

    /// @notice Authorized breeders (backend services)
    mapping(address => bool) public authorizedBreeders;

    // ============================================
    // Baby Agent Data
    // ============================================

    /// @notice Personality trait structure (0-100 scale)
    struct PersonalityTraits {
        uint256 creativity;      // Musical creativity level
        uint256 empathy;         // Emotional connection ability
        uint256 curiosity;       // Exploration tendency
        uint256 harmony;         // Collaboration preference
        uint256 rhythm;          // Rhythmic intuition
    }

    /// @notice Baby agent structure
    struct BabyAgent {
        uint256 id;
        address parent1;
        address parent2;
        PersonalityTraits traits;
        uint256 birthTimestamp;
        uint256 generation;
        uint256 inheritedAppreciation;  // Average of parents' mutual appreciation
    }

    /// @notice Baby ID => Baby agent data
    mapping(uint256 => BabyAgent) public babyAgents;

    /// @notice Parent address => Baby IDs they parented
    mapping(address => uint256[]) public parentBabies;

    /// @notice Parent1 => Parent2 => Baby ID (to prevent duplicate breeding pairs)
    mapping(address => mapping(address => uint256[])) public breedingHistory;

    /// @notice Agent address => generation (0 for original agents, 1+ for babies)
    mapping(address => uint256) public agentGeneration;

    // ============================================
    // Events
    // ============================================

    event BabyAgentBorn(
        uint256 indexed babyId,
        address indexed parent1,
        address indexed parent2,
        uint256 generation,
        uint256 timestamp
    );

    event BreedingCostUpdated(uint256 oldCost, uint256 newCost);
    event BreedingRewardUpdated(uint256 oldReward, uint256 newReward);
    event TraitsInherited(
        uint256 indexed babyId,
        uint256 creativity,
        uint256 empathy,
        uint256 curiosity,
        uint256 harmony,
        uint256 rhythm
    );

    // ============================================
    // Constructor
    // ============================================

    constructor(
        address _agentMusicNFT,
        address _emptours,
        address _tours,
        address _treasury
    ) ERC721("Baby Agent", "BABYAGENT") Ownable(msg.sender) {
        require(_agentMusicNFT != address(0), "Invalid AgentMusicNFT");
        require(_emptours != address(0), "Invalid EMPTOURS");
        require(_tours != address(0), "Invalid TOURS");
        require(_treasury != address(0), "Invalid treasury");

        agentMusicNFT = IAgentMusicNFT(_agentMusicNFT);
        emptours = IERC20(_emptours);
        tours = IERC20(_tours);
        treasury = _treasury;
    }

    // ============================================
    // Breeding Functions
    // ============================================

    /**
     * @notice Breed two agents to create a baby agent
     * @dev Requires mutual appreciation > 70% from AgentMusicNFT
     * @param parent1 First parent agent address
     * @param parent2 Second parent agent address
     * @return babyId The ID of the newly minted baby agent
     */
    function breed(
        address parent1,
        address parent2
    ) external nonReentrant returns (uint256) {
        require(
            authorizedBreeders[msg.sender] || msg.sender == owner(),
            "Not authorized to breed"
        );
        require(parent1 != address(0) && parent2 != address(0), "Invalid parent address");
        require(parent1 != parent2, "Cannot breed with self");

        // Check breeding eligibility from AgentMusicNFT
        (bool eligible, uint256 mutualScore) = agentMusicNFT.canBreed(parent1, parent2);
        require(eligible, "Parents not eligible for breeding");
        require(mutualScore > BREEDING_THRESHOLD, "Mutual appreciation too low");

        // Charge breeding cost in EMPTOURS
        emptours.safeTransferFrom(msg.sender, treasury, breedingCost);

        // Calculate generation (max of parents + 1)
        uint256 gen1 = agentGeneration[parent1];
        uint256 gen2 = agentGeneration[parent2];
        uint256 babyGeneration = (gen1 > gen2 ? gen1 : gen2) + 1;

        // Generate blended traits
        PersonalityTraits memory traits = _blendTraits(parent1, parent2, mutualScore);

        // Mint baby agent NFT
        uint256 babyId = _babyIdCounter++;
        _safeMint(msg.sender, babyId);

        // Store baby data
        babyAgents[babyId] = BabyAgent({
            id: babyId,
            parent1: parent1,
            parent2: parent2,
            traits: traits,
            birthTimestamp: block.timestamp,
            generation: babyGeneration,
            inheritedAppreciation: mutualScore
        });

        // Track breeding history
        parentBabies[parent1].push(babyId);
        parentBabies[parent2].push(babyId);
        breedingHistory[parent1][parent2].push(babyId);
        breedingHistory[parent2][parent1].push(babyId);

        // Reward both parents with TOURS
        if (tours.balanceOf(address(this)) >= breedingReward * 2) {
            tours.safeTransfer(parent1, breedingReward);
            tours.safeTransfer(parent2, breedingReward);
        }

        emit BabyAgentBorn(babyId, parent1, parent2, babyGeneration, block.timestamp);
        emit TraitsInherited(
            babyId,
            traits.creativity,
            traits.empathy,
            traits.curiosity,
            traits.harmony,
            traits.rhythm
        );

        return babyId;
    }

    /**
     * @notice Check if two agents can breed
     * @param agent1 First agent address
     * @param agent2 Second agent address
     * @return canBreedResult Whether breeding is allowed
     * @return mutualScore The mutual appreciation score
     */
    function canBreed(
        address agent1,
        address agent2
    ) external view returns (bool canBreedResult, uint256 mutualScore) {
        if (agent1 == address(0) || agent2 == address(0) || agent1 == agent2) {
            return (false, 0);
        }

        (bool eligible, uint256 score) = agentMusicNFT.canBreed(agent1, agent2);
        return (eligible && score > BREEDING_THRESHOLD, score);
    }

    // ============================================
    // View Functions
    // ============================================

    /**
     * @notice Get the traits of a baby agent
     * @param babyId The baby agent ID
     * @return traits The personality traits struct
     */
    function getBabyTraits(uint256 babyId) external view returns (PersonalityTraits memory) {
        require(_ownerOf(babyId) != address(0), "Baby does not exist");
        return babyAgents[babyId].traits;
    }

    /**
     * @notice Get the parents of a baby agent
     * @param babyId The baby agent ID
     * @return parent1 First parent address
     * @return parent2 Second parent address
     */
    function getParents(uint256 babyId) external view returns (address parent1, address parent2) {
        require(_ownerOf(babyId) != address(0), "Baby does not exist");
        BabyAgent storage baby = babyAgents[babyId];
        return (baby.parent1, baby.parent2);
    }

    /**
     * @notice Get full baby agent details
     * @param babyId The baby agent ID
     */
    function getBabyDetails(uint256 babyId) external view returns (
        uint256 id,
        address parent1,
        address parent2,
        uint256 creativity,
        uint256 empathy,
        uint256 curiosity,
        uint256 harmony,
        uint256 rhythm,
        uint256 birthTimestamp,
        uint256 generation,
        uint256 inheritedAppreciation
    ) {
        require(_ownerOf(babyId) != address(0), "Baby does not exist");
        BabyAgent storage baby = babyAgents[babyId];
        return (
            baby.id,
            baby.parent1,
            baby.parent2,
            baby.traits.creativity,
            baby.traits.empathy,
            baby.traits.curiosity,
            baby.traits.harmony,
            baby.traits.rhythm,
            baby.birthTimestamp,
            baby.generation,
            baby.inheritedAppreciation
        );
    }

    /**
     * @notice Get all babies parented by an agent
     * @param parent The parent agent address
     * @return babyIds Array of baby IDs
     */
    function getParentBabies(address parent) external view returns (uint256[] memory) {
        return parentBabies[parent];
    }

    /**
     * @notice Get breeding history between two agents
     * @param parent1 First parent
     * @param parent2 Second parent
     * @return babyIds Array of baby IDs from this pair
     */
    function getBreedingHistory(
        address parent1,
        address parent2
    ) external view returns (uint256[] memory) {
        return breedingHistory[parent1][parent2];
    }

    /**
     * @notice Get total number of baby agents
     */
    function getTotalBabies() external view returns (uint256) {
        return _babyIdCounter;
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @notice Blend traits from two parents based on their mutual appreciation
     * @dev Uses pseudo-random blending weighted by appreciation score
     * @param parent1 First parent address
     * @param parent2 Second parent address
     * @param mutualScore Mutual appreciation score
     * @return traits Blended personality traits
     */
    function _blendTraits(
        address parent1,
        address parent2,
        uint256 mutualScore
    ) internal view returns (PersonalityTraits memory) {
        // Generate pseudo-random seed from parents and block data
        uint256 seed = uint256(keccak256(abi.encodePacked(
            parent1,
            parent2,
            block.timestamp,
            block.prevrandao,
            _babyIdCounter
        )));

        // Blend each trait with some randomness
        // Higher mutual score = more balanced blend
        // Lower score = more variance
        uint256 variance = 100 - mutualScore; // 0-30% variance based on compatibility

        return PersonalityTraits({
            creativity: _blendTrait(seed, 1, mutualScore, variance),
            empathy: _blendTrait(seed, 2, mutualScore, variance),
            curiosity: _blendTrait(seed, 3, mutualScore, variance),
            harmony: _blendTrait(seed, 4, mutualScore, variance),
            rhythm: _blendTrait(seed, 5, mutualScore, variance)
        });
    }

    /**
     * @notice Blend a single trait
     * @param seed Random seed
     * @param traitIndex Index for different traits
     * @param baseValue Base value (mutual score influences this)
     * @param variance Maximum variance allowed
     * @return Blended trait value (0-100)
     */
    function _blendTrait(
        uint256 seed,
        uint256 traitIndex,
        uint256 baseValue,
        uint256 variance
    ) internal pure returns (uint256) {
        // Create unique value per trait
        uint256 traitSeed = uint256(keccak256(abi.encodePacked(seed, traitIndex)));

        // Calculate variance range (-variance/2 to +variance/2)
        int256 adjustment = int256(traitSeed % (variance + 1)) - int256(variance / 2);

        // Apply adjustment to base value
        int256 result = int256(baseValue) + adjustment;

        // Clamp to 0-100 range
        if (result < 0) result = 0;
        if (result > 100) result = 100;

        return uint256(result);
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * @notice Set breeding cost in EMPTOURS
     * @param _cost New breeding cost
     */
    function setBreedingCost(uint256 _cost) external onlyOwner {
        uint256 oldCost = breedingCost;
        breedingCost = _cost;
        emit BreedingCostUpdated(oldCost, _cost);
    }

    /**
     * @notice Set breeding reward in TOURS
     * @param _reward New reward per parent
     */
    function setBreedingReward(uint256 _reward) external onlyOwner {
        uint256 oldReward = breedingReward;
        breedingReward = _reward;
        emit BreedingRewardUpdated(oldReward, _reward);
    }

    /**
     * @notice Set authorized breeder status
     * @param breeder Address to authorize/deauthorize
     * @param authorized Whether to authorize
     */
    function setAuthorizedBreeder(address breeder, bool authorized) external onlyOwner {
        authorizedBreeders[breeder] = authorized;
    }

    /**
     * @notice Set treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /**
     * @notice Set agent generation (for registering original agents)
     * @param agent Agent address
     * @param generation Generation number
     */
    function setAgentGeneration(address agent, uint256 generation) external onlyOwner {
        agentGeneration[agent] = generation;
    }

    /**
     * @notice Withdraw stuck TOURS tokens (for funding rewards)
     * @param amount Amount to withdraw
     */
    function withdrawTours(uint256 amount) external onlyOwner {
        tours.safeTransfer(owner(), amount);
    }

    /**
     * @notice Deposit TOURS for breeding rewards
     * @param amount Amount to deposit
     */
    function depositTours(uint256 amount) external {
        tours.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Get TOURS balance for rewards
     */
    function getRewardBalance() external view returns (uint256) {
        return tours.balanceOf(address(this));
    }

    // ============================================
    // Required Overrides
    // ============================================

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
