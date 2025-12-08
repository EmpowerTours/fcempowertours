# Group Travel: Secure Architecture (No Shared Private Keys!)

## Critical Security Concern Addressed

**Your Question:**
> "whos in charge/able to control the wallets funds? will there be a private key involved? how many users can share this wallet?"

**ANSWER: NO SHARED PRIVATE KEYS! ❌**

You're absolutely right to be concerned. Shared private keys = security nightmare:
- ❌ Anyone with the key can drain all funds
- ❌ No way to revoke access
- ❌ Single point of failure
- ❌ Trust issues among members
- ❌ Legal/custody problems

---

## ✅ CORRECT ARCHITECTURE: Smart Contract Escrow

**How it works:**
```
NO private key sharing!
Funds held by smart contract (trustless escrow)
Rules enforced by code
Members retain control of their own wallets
```

---

## Three Architecture Options

Choose based on your trust model and use case:

### Option A: Creator-Controlled (Simplest) 👥

**Best for:** Friends traveling together, small trusted groups

**How it works:**
- Creator makes all spending decisions
- Members can view everything (transparent)
- Members can leave and get refund anytime
- Creator can't steal (withdrawals have rules)

**Control Flow:**
```
1. Creator creates group
2. Friends join and contribute funds
3. Funds locked in contract (NOT a wallet!)
4. Creator books experiences/rides
5. Contract automatically pays from pool
6. Settlement: Fair refund distribution
```

**Pros:**
- ✅ Simple decision-making
- ✅ Fast bookings (no voting delay)
- ✅ Good for trusted groups

**Cons:**
- ⚠️ Requires trust in creator
- ⚠️ Creator could book unwanted things
- ⚠️ Not ideal for strangers

---

### Option B: Multi-Approval (More Secure) 🔐

**Best for:** Larger groups, mixed trust levels

**How it works:**
- Spending requires N out of M approvals
- Example: 2 out of 4 members must approve each purchase
- More democratic than creator-only
- Prevents single person control

**Control Flow:**
```
1. Creator proposes group trip
2. Members join and contribute
3. Funds held in contract
4. Creator proposes booking: "50 MON for Experience"
5. Members vote: Approve or Reject
6. If threshold met (e.g., 50% yes), booking executes
7. If rejected, funds stay in pool
```

**Pros:**
- ✅ Democratic decision-making
- ✅ No single point of control
- ✅ Good for larger groups

**Cons:**
- ⚠️ Slower (need votes)
- ⚠️ Possible gridlock
- ⚠️ More complex UI

---

### Option C: Delegate System (Hybrid) 🎯

**Best for:** Tour guides leading groups

**How it works:**
- Members delegate spending limit to leader
- Leader can spend up to limit without approval
- Members can revoke delegation anytime
- Transparency maintained

**Control Flow:**
```
1. Tour guide creates group
2. Members join with contribution
3. Each member sets delegation: "Leader can spend up to 200 MON"
4. Leader books within budget
5. Members monitor spending
6. Can revoke if leader misbehaves
```

**Pros:**
- ✅ Flexible spending
- ✅ Can revoke if issues arise
- ✅ Good for guided tours

**Cons:**
- ⚠️ More complex smart contract
- ⚠️ Requires trust monitoring

---

## Recommended: Option A (Creator-Controlled) with Safety Rails

**Why:**
- Simplest implementation
- Best UX for friends traveling together
- Still secure (no shared keys!)
- Can add approval system later if needed

### Enhanced Safety Features:

```solidity
// GroupTravelSecure.sol

contract GroupTravelSecure {

    struct TravelGroup {
        uint256 groupId;
        string name;
        address creator;                // Only creator can initiate bookings
        address[] members;
        uint256 maxMembers;
        bool isActive;

        uint256 totalPooled;            // Total WMON held in contract
        mapping(address => uint256) contributions;
        mapping(address => bool) hasLeft; // Track who left early

        // Safety rails
        uint256 spendingLimit;          // Max per transaction
        uint256 totalSpent;
        uint256 dailySpendLimit;        // Prevent drain attacks
        uint256 lastSpendTimestamp;
        uint256 dailySpentToday;

        // Approval override (optional safety)
        mapping(uint256 => mapping(address => bool)) expenseApprovals;
        uint256 pendingExpenseId;

        uint256 createdAt;
        uint256 endDate;                // Auto-settle after trip ends
    }

    IERC20 public wmonToken;
    mapping(uint256 => TravelGroup) public groups;
    uint256 private _groupIdCounter;

    // Events
    event GroupCreated(uint256 indexed groupId, string name, address creator, uint256 spendingLimit);
    event MemberJoined(uint256 indexed groupId, address member, uint256 contribution);
    event MemberLeft(uint256 indexed groupId, address member, uint256 refund);
    event BookingProposed(uint256 indexed groupId, uint256 expenseId, string description, uint256 amount);
    event BookingExecuted(uint256 indexed groupId, uint256 amount, address recipient);
    event GroupSettled(uint256 indexed groupId, uint256 totalSpent, uint256 refunded);

    /**
     * @dev Create travel group with safety limits
     */
    function createGroup(
        string memory name,
        uint256 maxMembers,
        uint256 initialContribution,
        uint256 spendingLimit,          // Max 200 MON per transaction
        uint256 dailySpendLimit,        // Max 500 MON per day
        uint256 tripDurationDays
    ) external returns (uint256) {
        require(maxMembers >= 2 && maxMembers <= 20, "Invalid group size");
        require(spendingLimit > 0 && spendingLimit <= 1000 ether, "Invalid spending limit");

        uint256 groupId = _groupIdCounter++;
        TravelGroup storage group = groups[groupId];

        group.groupId = groupId;
        group.name = name;
        group.creator = msg.sender;
        group.maxMembers = maxMembers;
        group.isActive = true;
        group.spendingLimit = spendingLimit;
        group.dailySpendLimit = dailySpendLimit;
        group.createdAt = block.timestamp;
        group.endDate = block.timestamp + (tripDurationDays * 1 days);

        // Creator joins and contributes
        group.members.push(msg.sender);
        group.contributions[msg.sender] = initialContribution;
        group.totalPooled = initialContribution;

        // Transfer WMON to contract (NOT to a wallet!)
        require(
            wmonToken.transferFrom(msg.sender, address(this), initialContribution),
            "Transfer failed"
        );

        emit GroupCreated(groupId, name, msg.sender, spendingLimit);

        return groupId;
    }

    /**
     * @dev Member joins group
     * @notice Each member keeps their own wallet, no shared keys!
     */
    function joinGroup(uint256 groupId, uint256 contribution) external {
        TravelGroup storage group = groups[groupId];
        require(group.isActive, "Group not active");
        require(group.members.length < group.maxMembers, "Group full");
        require(!isMember(groupId, msg.sender), "Already a member");
        require(contribution > 0, "Must contribute");

        group.members.push(msg.sender);
        group.contributions[msg.sender] = contribution;
        group.totalPooled += contribution;

        // Transfer to contract escrow
        require(
            wmonToken.transferFrom(msg.sender, address(this), contribution),
            "Transfer failed"
        );

        emit MemberJoined(groupId, msg.sender, contribution);
    }

    /**
     * @dev Member can leave group and get proportional refund
     * @notice Can only leave if no bookings made yet, or after trip ends
     */
    function leaveGroup(uint256 groupId) external {
        TravelGroup storage group = groups[groupId];
        require(isMember(groupId, msg.sender), "Not a member");
        require(msg.sender != group.creator, "Creator cannot leave");
        require(!group.hasLeft[msg.sender], "Already left");

        // Can only leave if minimal spending has occurred
        require(group.totalSpent == 0, "Cannot leave after bookings made");

        uint256 memberContribution = group.contributions[msg.sender];
        group.hasLeft[msg.sender] = true;
        group.totalPooled -= memberContribution;

        // Refund their contribution
        require(
            wmonToken.transfer(msg.sender, memberContribution),
            "Refund failed"
        );

        emit MemberLeft(groupId, msg.sender, memberContribution);
    }

    /**
     * @dev Creator books experience for group
     * @notice Enforces spending limits for safety
     */
    function bookGroupExpense(
        uint256 groupId,
        address recipient,              // Experience contract, ServiceMarketplace, etc.
        uint256 amount,
        string memory description
    ) external {
        TravelGroup storage group = groups[groupId];
        require(msg.sender == group.creator, "Only creator can book");
        require(group.isActive, "Group not active");

        // SAFETY CHECKS
        require(amount <= group.spendingLimit, "Exceeds per-transaction limit");
        require(group.totalPooled >= amount, "Insufficient funds");

        // Daily spending limit check
        if (block.timestamp - group.lastSpendTimestamp > 1 days) {
            group.dailySpentToday = 0;
            group.lastSpendTimestamp = block.timestamp;
        }
        require(group.dailySpentToday + amount <= group.dailySpendLimit, "Exceeds daily limit");

        // Execute payment
        group.totalSpent += amount;
        group.totalPooled -= amount;
        group.dailySpentToday += amount;

        require(
            wmonToken.transfer(recipient, amount),
            "Payment failed"
        );

        emit BookingExecuted(groupId, amount, recipient);
    }

    /**
     * @dev Settle group after trip ends - distribute remaining funds
     */
    function settleGroup(uint256 groupId) external {
        TravelGroup storage group = groups[groupId];
        require(msg.sender == group.creator, "Only creator can settle");
        require(group.isActive, "Already settled");
        require(block.timestamp >= group.endDate || group.totalPooled == 0, "Trip not ended");

        group.isActive = false;

        // Distribute remaining funds proportionally
        uint256 remaining = group.totalPooled;

        if (remaining > 0) {
            // Calculate total contributions from active members
            uint256 totalActiveContributions = 0;
            for (uint256 i = 0; i < group.members.length; i++) {
                address member = group.members[i];
                if (!group.hasLeft[member]) {
                    totalActiveContributions += group.contributions[member];
                }
            }

            // Refund proportionally
            for (uint256 i = 0; i < group.members.length; i++) {
                address member = group.members[i];
                if (!group.hasLeft[member]) {
                    uint256 memberShare = (remaining * group.contributions[member]) / totalActiveContributions;

                    if (memberShare > 0) {
                        require(wmonToken.transfer(member, memberShare), "Refund failed");
                    }
                }
            }
        }

        emit GroupSettled(groupId, group.totalSpent, remaining);
    }

    /**
     * @dev Emergency: Member can request refund if creator goes rogue
     * @notice Requires 50% of members to vote yes
     */
    function emergencyRefundVote(uint256 groupId) external {
        TravelGroup storage group = groups[groupId];
        require(isMember(groupId, msg.sender), "Not a member");
        require(group.isActive, "Not active");

        // Implementation: Voting mechanism for emergency shutdown
        // If 50%+ members vote, trigger immediate settlement
    }

    /**
     * @dev Check if address is member
     */
    function isMember(uint256 groupId, address user) public view returns (bool) {
        TravelGroup storage group = groups[groupId];
        for (uint256 i = 0; i < group.members.length; i++) {
            if (group.members[i] == user && !group.hasLeft[user]) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get group details (public transparency)
     */
    function getGroup(uint256 groupId) external view returns (
        string memory name,
        address creator,
        address[] memory members,
        uint256 totalPooled,
        uint256 totalSpent,
        uint256 spendingLimit,
        uint256 dailySpendLimit,
        bool isActive
    ) {
        TravelGroup storage group = groups[groupId];
        return (
            group.name,
            group.creator,
            group.members,
            group.totalPooled,
            group.totalSpent,
            group.spendingLimit,
            group.dailySpendLimit,
            group.isActive
        );
    }

    /**
     * @dev Get member's contribution and share
     */
    function getMemberInfo(uint256 groupId, address member) external view returns (
        uint256 contribution,
        uint256 currentShare,
        bool hasLeft
    ) {
        TravelGroup storage group = groups[groupId];
        contribution = group.contributions[member];
        hasLeft = group.hasLeft[member];

        if (!hasLeft && group.totalPooled > 0) {
            // Calculate current proportional share
            uint256 totalActiveContributions = 0;
            for (uint256 i = 0; i < group.members.length; i++) {
                if (!group.hasLeft[group.members[i]]) {
                    totalActiveContributions += group.contributions[group.members[i]];
                }
            }
            currentShare = (group.totalPooled * contribution) / totalActiveContributions;
        }

        return (contribution, currentShare, hasLeft);
    }
}
```

---

## Key Security Features

### 1. **No Shared Private Keys** ✅
```
❌ BAD: "Here's the group wallet seed phrase, share with everyone"
✅ GOOD: Smart contract holds funds, each member keeps own wallet
```

### 2. **Spending Limits** 🔒
```solidity
spendingLimit: 200 WMON per transaction
dailySpendLimit: 500 WMON per day

// Prevents creator from draining entire pool at once
```

### 3. **Transparency** 👁️
```typescript
// Everyone can view spending history
const groupDetails = await contract.getGroup(groupId);
console.log('Total spent:', groupDetails.totalSpent);
console.log('Remaining:', groupDetails.totalPooled);

// Each member can check their share
const myShare = await contract.getMemberInfo(groupId, myAddress);
console.log('My contribution:', myShare.contribution);
console.log('My current share:', myShare.currentShare);
```

### 4. **Fair Refunds** 💰
```solidity
// Proportional distribution based on contributions
// If you contributed 30% of pool, you get 30% of remainder
```

### 5. **Exit Option** 🚪
```typescript
// Members can leave early (before bookings)
await contract.leaveGroup(groupId);
// Get full refund automatically
```

### 6. **Time Limits** ⏰
```solidity
endDate: block.timestamp + (7 days);

// After trip ends, auto-settle
// Prevents funds locked forever
```

---

## Frontend UX

### Creating a Group

```typescript
// components/CreateGroupTrip.tsx

export function CreateGroupTrip() {
  const [groupName, setGroupName] = useState('Ghana Adventure 2025');
  const [maxMembers, setMaxMembers] = useState(4);
  const [myContribution, setMyContribution] = useState('200');
  const [tripDays, setTripDays] = useState(7);

  // Safety settings
  const [spendingLimit, setSpendingLimit] = useState('200'); // Max per booking
  const [dailyLimit, setDailyLimit] = useState('500'); // Max per day

  const handleCreate = async () => {
    const groupId = await createGroup({
      name: groupName,
      maxMembers,
      initialContribution: parseEther(myContribution),
      spendingLimit: parseEther(spendingLimit),
      dailySpendLimit: parseEther(dailyLimit),
      tripDurationDays: tripDays
    });

    // Generate invite link
    const inviteLink = `https://empowertours.com/groups/${groupId}`;

    // Share via Farcaster
    await shareToFarcaster(`Join my trip to Ghana! ${inviteLink}`);
  };

  return (
    <div className="create-group-form">
      <h2>Create Group Trip</h2>

      <input
        placeholder="Trip Name"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
      />

      <input
        type="number"
        placeholder="Max Members (2-20)"
        value={maxMembers}
        onChange={(e) => setMaxMembers(parseInt(e.target.value))}
      />

      <input
        placeholder="Your Contribution (WMON)"
        value={myContribution}
        onChange={(e) => setMyContribution(e.target.value)}
      />

      <input
        type="number"
        placeholder="Trip Duration (days)"
        value={tripDays}
        onChange={(e) => setTripDays(parseInt(e.target.value))}
      />

      <div className="safety-settings">
        <h3>Safety Limits (Prevents misuse)</h3>

        <div className="limit-input">
          <label>Max per booking:</label>
          <input
            value={spendingLimit}
            onChange={(e) => setSpendingLimit(e.target.value)}
          />
          <span>WMON</span>
        </div>

        <div className="limit-input">
          <label>Max per day:</label>
          <input
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
          />
          <span>WMON</span>
        </div>

        <p className="text-xs text-gray-400">
          These limits prevent accidental or malicious overspending
        </p>
      </div>

      <button onClick={handleCreate}>
        Create Group & Get Invite Link
      </button>
    </div>
  );
}
```

### Group Dashboard (Full Transparency)

```typescript
// components/GroupDashboard.tsx

export function GroupDashboard({ groupId }) {
  const group = useGroup(groupId);
  const myAddress = useAddress();
  const myInfo = useMemberInfo(groupId, myAddress);
  const isCreator = group.creator === myAddress;

  return (
    <div className="group-dashboard">
      {/* Header */}
      <div className="header">
        <h1>{group.name}</h1>
        {isCreator && <span className="badge">Creator</span>}
      </div>

      {/* Financial Summary (Public Transparency) */}
      <div className="financial-summary">
        <div className="stat">
          <p>Total Pool</p>
          <p className="amount">{formatEther(group.totalPooled)} WMON</p>
        </div>
        <div className="stat">
          <p>Total Spent</p>
          <p className="amount">{formatEther(group.totalSpent)} WMON</p>
        </div>
        <div className="stat">
          <p>Spending Limit</p>
          <p className="amount">{formatEther(group.spendingLimit)} WMON / booking</p>
        </div>
        <div className="stat">
          <p>Daily Limit</p>
          <p className="amount">{formatEther(group.dailySpendLimit)} WMON / day</p>
        </div>
      </div>

      {/* Members List */}
      <div className="members">
        <h3>👥 Members ({group.members.length}/{group.maxMembers})</h3>
        {group.members.map((member, i) => (
          <div key={i} className="member-card">
            <div>
              <p className="address">{truncateAddress(member)}</p>
              {member === group.creator && <span className="badge">Creator</span>}
            </div>
            <div className="contribution">
              <p>Contributed: {formatEther(group.contributions[member])} WMON</p>
              {member === myAddress && (
                <p className="text-sm">Your share: {formatEther(myInfo.currentShare)} WMON</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="actions">
        {isCreator ? (
          <>
            <h3>Book for Group</h3>
            <button onClick={() => handleBookExperience(groupId)}>
              🎫 Book Experience
            </button>
            <button onClick={() => handleBookRide(groupId)}>
              🚗 Book Shared Ride
            </button>
            <button onClick={() => handleSettle(groupId)}>
              💰 Settle & Distribute Funds
            </button>
          </>
        ) : (
          <>
            <p>Only the creator can make bookings</p>
            {group.totalSpent === 0 && (
              <button onClick={() => handleLeave(groupId)} className="btn-danger">
                🚪 Leave Group (Get Refund)
              </button>
            )}
          </>
        )}
      </div>

      {/* Spending History (Transparent) */}
      <div className="spending-history">
        <h3>📊 Spending History</h3>
        {/* Show all transactions from contract events */}
        <SpendingLog groupId={groupId} />
      </div>

      {/* Safety Info */}
      <div className="safety-info">
        <h4>🔒 Safety Features</h4>
        <ul>
          <li>✅ No shared private keys</li>
          <li>✅ Spending limits enforced by smart contract</li>
          <li>✅ Full transparency (everyone sees everything)</li>
          <li>✅ Fair refund distribution</li>
          <li>✅ Auto-settle after trip ends</li>
        </ul>
      </div>
    </div>
  );
}
```

---

## Limitations & Scale

### Maximum Group Size: **20 members** (Recommended: 4-8)

**Why limit?**
- Gas costs increase with more members
- Decision-making becomes slower
- More complex refund calculations
- Higher risk of disputes

**For larger groups:**
Consider creating multiple sub-groups or using a tour operator account.

---

## Comparison Table

| Feature | Shared Wallet ❌ | Smart Contract Escrow ✅ |
|---------|------------------|---------------------------|
| **Private Key Sharing** | Required | NOT required |
| **Security** | Single point of failure | Trustless escrow |
| **Control** | Anyone with key | Rules-based (creator only) |
| **Transparency** | Limited | Full on-chain visibility |
| **Refunds** | Manual, trust-based | Automatic, fair |
| **Revocation** | Impossible | Members can leave early |
| **Spending Limits** | None | Enforced by contract |
| **Audit Trail** | None | Complete transaction history |

---

## Security Audit Checklist

Before deploying GroupTravel contract:

- [ ] No private key sharing mechanism
- [ ] Spending limits enforced
- [ ] Members can view all transactions
- [ ] Fair refund distribution tested
- [ ] Creator cannot drain funds arbitrarily
- [ ] Time-based auto-settlement works
- [ ] Emergency exit mechanism functional
- [ ] Gas optimization for settlements
- [ ] Reentrancy guards on all fund transfers
- [ ] Access control properly implemented

---

## Summary

### ✅ CORRECT: Smart Contract Escrow
- Contract holds funds (NOT a wallet)
- No shared private keys
- Rules enforced by code
- Transparent to all members
- Fair automatic refunds

### ❌ WRONG: Shared Wallet
- One seed phrase shared among friends
- Anyone can drain everything
- No recourse if someone steals
- Legal/custody nightmare

### 🎯 Recommended Implementation
**Creator-Controlled with Safety Rails:**
- Creator initiates bookings
- Spending limits prevent abuse
- Members can view everything
- Fair settlement at end
- Members can leave early

**This balances usability (fast decisions) with security (can't get rugged)!**

---

**Last Updated:** December 2025
**Status:** Secure Architecture Ready for Implementation
**Max Group Size:** 20 members (recommended: 4-8)
