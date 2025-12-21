// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EmpowerToursRegistry
 * @notice On-chain profile registry for EmpowerTours users and guides
 * @dev Works with MirrorMate contract for matching/payments
 *      This contract stores ONLY profile data (bio, location, languages, transport)
 *      MirrorMate handles all payment logic (skip fees, match payments)
 */
contract EmpowerToursRegistry {

    struct UserProfile {
        uint256 fid; // Farcaster ID
        string username;
        string displayName;
        string pfpUrl;
        bool isGuide; // True if registered as a guide
        string bio; // Max 140 chars recommended
        string location; // e.g. "Kyoto, Japan"
        string languages; // Comma-separated: "English, Japanese"
        string transport; // Comma-separated: "WALK, TRAIN, CAR"
        uint256 registeredAt;
        uint256 lastUpdated;
        bool exists;
    }

    // Mapping from FID to user profile
    mapping(uint256 => UserProfile) public profiles;

    // List of all registered guide FIDs (for discovery)
    uint256[] public guideFids;

    // Track if FID is in guides list (O(1) lookup)
    mapping(uint256 => bool) public isRegisteredGuide;
    mapping(uint256 => uint256) public guideFidIndex; // FID -> index in guideFids array

    // Events
    event UserRegistered(uint256 indexed fid, string username, bool isGuide, uint256 timestamp);
    event ProfileUpdated(uint256 indexed fid, string bio, string location, uint256 timestamp);
    event GuideStatusChanged(uint256 indexed fid, bool isGuide, uint256 timestamp);

    /**
     * @notice Register or update a user profile
     * @param fid Farcaster ID
     * @param username Farcaster username
     * @param displayName Display name
     * @param pfpUrl Profile picture URL (IPFS or HTTP)
     * @param isGuide Whether user is registering as a guide
     * @param bio User bio (140 chars max recommended)
     * @param location User location
     * @param languages Comma-separated languages (e.g. "English, Spanish")
     * @param transport Comma-separated transport modes (e.g. "WALK, CAR, TRAIN")
     */
    function registerUser(
        uint256 fid,
        string memory username,
        string memory displayName,
        string memory pfpUrl,
        bool isGuide,
        string memory bio,
        string memory location,
        string memory languages,
        string memory transport
    ) external {
        require(fid > 0, "Invalid FID");
        require(bytes(username).length > 0, "Username required");

        bool isNewUser = !profiles[fid].exists;
        bool wasGuide = profiles[fid].isGuide;

        // Update profile
        profiles[fid] = UserProfile({
            fid: fid,
            username: username,
            displayName: displayName,
            pfpUrl: pfpUrl,
            isGuide: isGuide,
            bio: bio,
            location: location,
            languages: languages,
            transport: transport,
            registeredAt: isNewUser ? block.timestamp : profiles[fid].registeredAt,
            lastUpdated: block.timestamp,
            exists: true
        });

        // Manage guides list
        if (isGuide && !wasGuide) {
            // User became a guide
            if (!isRegisteredGuide[fid]) {
                guideFidIndex[fid] = guideFids.length;
                guideFids.push(fid);
                isRegisteredGuide[fid] = true;
            }
            emit GuideStatusChanged(fid, true, block.timestamp);
        } else if (!isGuide && wasGuide) {
            // User stopped being a guide
            _removeFromGuidesList(fid);
            emit GuideStatusChanged(fid, false, block.timestamp);
        }

        if (isNewUser) {
            emit UserRegistered(fid, username, isGuide, block.timestamp);
        } else {
            emit ProfileUpdated(fid, bio, location, block.timestamp);
        }
    }

    /**
     * @notice Quick bio/location update
     * @param fid Farcaster ID
     * @param bio New bio
     * @param location New location
     */
    function updateProfile(uint256 fid, string memory bio, string memory location) external {
        require(profiles[fid].exists, "User not registered");

        profiles[fid].bio = bio;
        profiles[fid].location = location;
        profiles[fid].lastUpdated = block.timestamp;

        emit ProfileUpdated(fid, bio, location, block.timestamp);
    }

    /**
     * @notice Toggle guide status
     * @param fid Farcaster ID
     * @param isGuide New guide status
     */
    function setGuideStatus(uint256 fid, bool isGuide) external {
        require(profiles[fid].exists, "User not registered");
        require(profiles[fid].isGuide != isGuide, "Status unchanged");

        profiles[fid].isGuide = isGuide;
        profiles[fid].lastUpdated = block.timestamp;

        if (isGuide) {
            if (!isRegisteredGuide[fid]) {
                guideFidIndex[fid] = guideFids.length;
                guideFids.push(fid);
                isRegisteredGuide[fid] = true;
            }
        } else {
            _removeFromGuidesList(fid);
        }

        emit GuideStatusChanged(fid, isGuide, block.timestamp);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @notice Get user profile by FID
     * @param fid Farcaster ID
     * @return UserProfile struct
     */
    function getUserProfile(uint256 fid) external view returns (UserProfile memory) {
        require(profiles[fid].exists, "User not registered");
        return profiles[fid];
    }

    /**
     * @notice Check if user exists
     * @param fid Farcaster ID
     * @return bool
     */
    function userExists(uint256 fid) external view returns (bool) {
        return profiles[fid].exists;
    }

    /**
     * @notice Get all registered guide FIDs
     * @return Array of guide FIDs
     */
    function getAllGuides() external view returns (uint256[] memory) {
        return guideFids;
    }

    /**
     * @notice Get total number of guides
     * @return Number of guides
     */
    function getGuidesCount() external view returns (uint256) {
        return guideFids.length;
    }

    /**
     * @notice Get paginated guides
     * @param offset Starting index
     * @param limit Number of results
     * @return Array of guide FIDs
     */
    function getGuidesPaginated(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256 totalGuides = guideFids.length;

        if (offset >= totalGuides) {
            return new uint256[](0);
        }

        uint256 resultSize = limit;
        if (offset + limit > totalGuides) {
            resultSize = totalGuides - offset;
        }

        uint256[] memory result = new uint256[](resultSize);
        for (uint256 i = 0; i < resultSize; i++) {
            result[i] = guideFids[offset + i];
        }

        return result;
    }

    /**
     * @notice Get guides by location (simple contains check)
     * @param locationQuery Location string to match
     * @return Array of matching guide FIDs
     */
    function getGuidesByLocation(string memory locationQuery) external view returns (uint256[] memory) {
        uint256 matchCount = 0;

        // Count matches
        for (uint256 i = 0; i < guideFids.length; i++) {
            uint256 fid = guideFids[i];
            if (_stringContains(profiles[fid].location, locationQuery)) {
                matchCount++;
            }
        }

        // Collect matches
        uint256[] memory matches = new uint256[](matchCount);
        uint256 currentIndex = 0;

        for (uint256 i = 0; i < guideFids.length; i++) {
            uint256 fid = guideFids[i];
            if (_stringContains(profiles[fid].location, locationQuery)) {
                matches[currentIndex] = fid;
                currentIndex++;
            }
        }

        return matches;
    }

    /**
     * @notice Get multiple profiles at once (batch read)
     * @param fids Array of FIDs to fetch
     * @return Array of UserProfile structs
     */
    function getBatchProfiles(uint256[] memory fids) external view returns (UserProfile[] memory) {
        UserProfile[] memory batchProfiles = new UserProfile[](fids.length);

        for (uint256 i = 0; i < fids.length; i++) {
            if (profiles[fids[i]].exists) {
                batchProfiles[i] = profiles[fids[i]];
            }
        }

        return batchProfiles;
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * @dev Remove FID from guides list (O(1) swap and pop)
     */
    function _removeFromGuidesList(uint256 fid) internal {
        if (!isRegisteredGuide[fid]) return;

        uint256 index = guideFidIndex[fid];
        uint256 lastIndex = guideFids.length - 1;

        if (index != lastIndex) {
            uint256 lastFid = guideFids[lastIndex];
            guideFids[index] = lastFid;
            guideFidIndex[lastFid] = index;
        }

        guideFids.pop();
        delete guideFidIndex[fid];
        isRegisteredGuide[fid] = false;
    }

    /**
     * @dev Case-sensitive string contains check
     */
    function _stringContains(string memory str, string memory substr) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory substrBytes = bytes(substr);

        if (substrBytes.length > strBytes.length) return false;
        if (substrBytes.length == 0) return true;

        for (uint256 i = 0; i <= strBytes.length - substrBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < substrBytes.length; j++) {
                if (strBytes[i + j] != substrBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
}
