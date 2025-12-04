// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Author: Automated generator
// Notes: Non-functional comments only

import { FHE, euint32, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SabbaticalFHE is SepoliaConfig {
    // Identifier counters
    uint256 public profileCount;
    uint256 public planCount;

    // Encrypted employee profile container
    struct EncryptedProfile {
        uint256 id;
        euint32 encCareerGoals;    // encrypted payload index
        euint32 encInterests;      // encrypted payload index
        euint32 encMetadata;       // encrypted payload index
        uint256 createdAt;
    }

    // Encrypted suggested sabbatical plan
    struct EncryptedPlan {
        uint256 id;
        uint256 profileId;
        euint32 encSchedule;       // encrypted schedule description
        euint32 encObjectives;     // encrypted objectives
        euint32 encDuration;       // encrypted duration
        uint256 requestedAt;
        bool finalized;
    }

    // Decrypted view after reveal
    struct DecryptedPlan {
        string schedule;
        string objectives;
        uint32 duration;
        bool revealed;
    }

    // Storage
    mapping(uint256 => EncryptedProfile) public profiles;
    mapping(uint256 => EncryptedPlan) public plans;
    mapping(uint256 => DecryptedPlan) public revealedPlans;

    // Linkage
    mapping(address => uint256[]) private profilesByOwner;

    // Request tracking
    mapping(uint256 => uint256) private requestToPlan;
    mapping(uint256 => uint256) private requestToProfile;

    // Events
    event ProfileRegistered(uint256 indexed profileId, address indexed owner);
    event PlanProposed(uint256 indexed planId, uint256 indexed profileId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed targetId);
    event PlanRevealed(uint256 indexed planId);

    // Modifiers
    modifier onlyOwnerOfProfile(uint256 profileId) {
        // Access control placeholder
        _;
    }

    // Constructor
    constructor() {}

    // Register an encrypted employee profile
    function registerEncryptedProfile(
        euint32 encCareerGoals,
        euint32 encInterests,
        euint32 encMetadata
    ) public returns (uint256) {
        profileCount += 1;
        uint256 pid = profileCount;

        profiles[pid] = EncryptedProfile({
            id: pid,
            encCareerGoals: encCareerGoals,
            encInterests: encInterests,
            encMetadata: encMetadata,
            createdAt: block.timestamp
        });

        profilesByOwner[msg.sender].push(pid);

        emit ProfileRegistered(pid, msg.sender);
        return pid;
    }

    // Propose an encrypted sabbatical plan for a profile
    function proposeEncryptedPlan(
        uint256 profileId,
        euint32 encSchedule,
        euint32 encObjectives,
        euint32 encDuration
    ) public returns (uint256) {
        require(profileId > 0 && profileId <= profileCount, "Invalid profile");

        planCount += 1;
        uint256 plid = planCount;

        plans[plid] = EncryptedPlan({
            id: plid,
            profileId: profileId,
            encSchedule: encSchedule,
            encObjectives: encObjectives,
            encDuration: encDuration,
            requestedAt: block.timestamp,
            finalized: false
        });

        emit PlanProposed(plid, profileId);
        return plid;
    }

    // Request decryption of a specific plan's encrypted fields
    function requestPlanDecryption(uint256 planId) public returns (uint256) {
        require(planId > 0 && planId <= planCount, "Invalid plan");
        EncryptedPlan storage p = plans[planId];
        require(!p.finalized, "Already finalized");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(p.encSchedule);
        ciphertexts[1] = FHE.toBytes32(p.encObjectives);
        ciphertexts[2] = FHE.toBytes32(p.encDuration);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.handlePlanDecryption.selector);
        requestToPlan[reqId] = planId;

        emit DecryptionRequested(reqId, planId);
        return reqId;
    }

    // Request decryption of profile-sensitive aggregated metadata
    function requestProfileDecryption(uint256 profileId) public returns (uint256) {
        require(profileId > 0 && profileId <= profileCount, "Invalid profile");
        EncryptedProfile storage prof = profiles[profileId];

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(prof.encCareerGoals);
        ciphertexts[1] = FHE.toBytes32(prof.encInterests);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.handleProfileDecryption.selector);
        requestToProfile[reqId] = profileId;

        emit DecryptionRequested(reqId, profileId);
        return reqId;
    }

    // Callback invoked by FHE to deliver decrypted plan data
    function handlePlanDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 planId = requestToPlan[requestId];
        require(planId != 0, "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory decoded = abi.decode(cleartexts, (string[]));
        require(decoded.length == 3, "Bad payload");

        DecryptedPlan storage dp = revealedPlans[planId];
        dp.schedule = decoded[0];
        dp.objectives = decoded[1];
        dp.duration = parseUint32(decoded[2]);
        dp.revealed = true;

        plans[planId].finalized = true;

        emit PlanRevealed(planId);
    }

    // Callback invoked by FHE to deliver decrypted profile data
    function handleProfileDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 profileId = requestToProfile[requestId];
        require(profileId != 0, "Unknown request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decoded values could be handled off-chain; kept minimal here
        // Intentionally no further on-chain processing
    }

    // View helper: get revealed plan for UI consumption
    function getRevealedPlan(uint256 planId) public view returns (string memory, string memory, uint32, bool) {
        DecryptedPlan storage dp = revealedPlans[planId];
        return (dp.schedule, dp.objectives, dp.duration, dp.revealed);
    }

    // Utility: convert decoded numeric string to uint32
    function parseUint32(string memory s) internal pure returns (uint32) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
                if (result > type(uint32).max) {
                    return type(uint32).max;
                }
            }
        }
        return uint32(result);
    }

    // Helper: list profiles owned by an address
    function listProfilesOf(address owner) public view returns (uint256[] memory) {
        return profilesByOwner[owner];
    }

    // Safety: allow manual settlement of stuck requests (owner-only placeholder)
    function emergencyClearRequest(uint256 requestId) public {
        // No-op placeholder for governance action
        delete requestToPlan[requestId];
        delete requestToProfile[requestId];
    }

    // Fallbacks
    receive() external payable {}
    fallback() external payable {}
}
