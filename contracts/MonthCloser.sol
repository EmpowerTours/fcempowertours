// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMusicSubscriptionV6Closer {
    function finalizeMonthlyDistribution(uint256 monthId) external;
    function withdrawReserveToDAO(address dao, uint256 amount) external;
    function getReserveBalance() external view returns (uint256);
    function monthlyStats(uint256 monthId) external view returns (uint256 totalRevenue, uint256 totalPlays, uint256 artistPool, bool finalized);
    function transferOwnership(address newOwner) external;
}

interface IListenerRewardPoolCloser {
    function fundMonth(uint256 monthId, uint256 amount) external;
    function batchSetListenerPoints(uint256 monthId, address[] calldata listeners, uint256[] calldata points) external;
    function finalizeMonth(uint256 monthId) external;
    function acceptOwnership() external;
    function transferOwnership(address newOwner) external;
}

/// Same shape as the Monad scheduled-transactions MIP draft `schedule()`.
interface IScheduler {
    function schedule(uint256 targetBlock, address to, uint256 value, uint256 gasLimit, bytes calldata data)
        external payable returns (uint64 handle);
    function getQuote(uint256 targetBlock, uint256 gasLimit) external view returns (uint256);
    function MAX_WINDOW() external view returns (uint256);
}

/**
 * @title MonthCloser
 * @notice Runs the production month-end as ONE transaction. These are the six owner txs sent
 *         by hand on 4 Oct 2026 (V6 finalize, withdrawReserveToDAO, WMON approve,
 *         ListenerRewardPool fundMonth, batchSetListenerPoints, finalizeMonth).
 *
 * @dev    - Atomic: any step reverting reverts all of them, so it can't leave V6 finalized but the
 *           pool unfunded.
 *         - Timestamp-targeted: month m closes once block.timestamp >= (m+1) * 30 days, the
 *           same month id V6 and the pool use.
 *         - Zero-play months: V6 itself moves the unclaimable pool into the reserve on finalize,
 *           so there is NO emergencyWithdraw rescue path here. The guard on V6 would refuse it.
 *         - Liveness: `tick()` is permissionless and idempotent. It closes whatever is due and
 *           re-arms itself through an optional scheduler (IScheduler, draft-compatible). Until a
 *           scheduler exists, `poke()` pays a one-time bounty to whoever performs a late close.
 *         - Points are the one off-chain input (radio stats). `pointsSetter` stages them; a
 *           close for a month without staged points reverts rather than funding blind.
 *         - To work, this contract must OWN V6 and the pool. That handover is an admin action
 *           NOT performed by this change. `adminCall` keeps every owner-only function reachable
 *           and `returnOwnership` hands both back.
 */
contract MonthCloser {
    uint256 public constant MONTH = 30 days;
    uint256 public constant GRACE = 6 hours;
    /// Pessimistic Monad block time in ms (measured 302.6 ms): earlier blocks are never late, only hop.
    uint256 public constant BLOCK_MS_PESSIMISTIC = 280;

    IMusicSubscriptionV6Closer public immutable sub;
    IListenerRewardPoolCloser public immutable pool;
    IERC20 public immutable wmon;

    address public admin;
    address public pointsSetter;
    IScheduler public scheduler;   // address(0) until the precompile ships
    uint256 public tickGasLimit = 900_000;
    uint256 public bounty;         // paid in native MON, from this contract's balance

    mapping(uint256 => bool) public closed;
    mapping(uint256 => bool) public staged;
    mapping(uint256 => address[]) internal _users;
    mapping(uint256 => uint256[]) internal _points;
    mapping(uint256 => bool) public bountyPaid;
    uint256 public nextMonth;      // lowest month id not yet closed by this contract
    uint256 public armedBlock;     // target block of the pending scheduled tick (0 = none)
    bool private _entered;

    event PointsStaged(uint256 indexed monthId, uint256 listeners);
    event MonthClosed(uint256 indexed monthId, uint256 funded, address indexed by);
    event Armed(uint256 targetBlock, uint64 handle);
    event ArmFailed(uint256 targetBlock);
    event BountyPaid(uint256 indexed monthId, address indexed to, uint256 amount);

    error NotAdmin();
    error NotPointsSetter();
    error MonthOpen();
    error AlreadyClosed();
    error NotStaged();
    error LengthMismatch();
    error Reentrant();
    error BadTarget();
    error NothingDue();

    modifier onlyAdmin() { if (msg.sender != admin) revert NotAdmin(); _; }
    modifier nonReentrant() { if (_entered) revert Reentrant(); _entered = true; _; _entered = false; }

    constructor(address sub_, address pool_, address wmon_, address admin_, address pointsSetter_, uint256 firstMonth) {
        sub = IMusicSubscriptionV6Closer(sub_);
        pool = IListenerRewardPoolCloser(pool_);
        wmon = IERC20(wmon_);
        admin = admin_;
        pointsSetter = pointsSetter_;
        nextMonth = firstMonth;
    }

    receive() external payable {}

    // ------------------------------------------------------------ points

    function stagePoints(uint256 m, address[] calldata users, uint256[] calldata points) external {
        if (msg.sender != pointsSetter) revert NotPointsSetter();
        if (closed[m]) revert AlreadyClosed();
        if (users.length != points.length) revert LengthMismatch();
        _users[m] = users;
        _points[m] = points;
        staged[m] = true;
        emit PointsStaged(m, users.length);
    }

    // ------------------------------------------------------------ close

    function monthEnd(uint256 m) public pure returns (uint256) { return (m + 1) * MONTH; }

    /// Close month `m`: the six production steps, all or nothing.
    function close(uint256 m) public nonReentrant returns (uint256 funded) {
        if (block.timestamp < monthEnd(m)) revert MonthOpen();
        if (closed[m]) revert AlreadyClosed();
        if (!staged[m]) revert NotStaged();
        closed[m] = true;
        if (m >= nextMonth) nextMonth = m + 1;

        (uint256 revenue,,, bool fin) = sub.monthlyStats(m);
        if (!fin && revenue > 0) sub.finalizeMonthlyDistribution(m);   // 1
        funded = sub.getReserveBalance();
        if (funded > 0) {
            sub.withdrawReserveToDAO(address(this), funded);            // 2
            wmon.approve(address(pool), funded);                        // 3
            pool.fundMonth(m, funded);                                  // 4
        }
        pool.batchSetListenerPoints(m, _users[m], _points[m]);          // 5
        pool.finalizeMonth(m);                                          // 6
        emit MonthClosed(m, funded, msg.sender);
    }

    /// Permissionless driver: close the next month if due, then re-arm. Safe to call any time.
    function tick() public returns (bool didClose) {
        uint256 m = nextMonth;
        if (block.timestamp >= monthEnd(m) && staged[m] && !closed[m]) {
            close(m);
            didClose = true;
        }
        _arm();
    }

    /// Bounty fallback: a late close (past monthEnd + GRACE) pays the caller once per month.
    function poke() external {
        uint256 m = nextMonth;
        if (!tick()) revert NothingDue();
        if (block.timestamp > monthEnd(m) + GRACE && !bountyPaid[m] && bounty > 0 && address(this).balance >= bounty) {
            bountyPaid[m] = true;
            emit BountyPaid(m, msg.sender, bounty);
            (bool ok,) = msg.sender.call{value: bounty}("");
            require(ok, "bounty");
        }
    }

    function _arm() internal {
        IScheduler s = scheduler;
        if (address(s) == address(0)) return;
        // One pending tick at a time, so spamming tick() can't drain the fee budget.
        if (armedBlock > block.number) return;
        uint256 end = monthEnd(nextMonth);
        uint256 blocksAhead = end > block.timestamp ? ((end - block.timestamp) * 1000) / BLOCK_MS_PESSIMISTIC : 0;
        uint256 maxW = s.MAX_WINDOW();
        if (blocksAhead > maxW) blocksAhead = maxW;          // hop: far targets re-arm on arrival
        if (blocksAhead < 2) blocksAhead = 2;
        uint256 target = block.number + blocksAhead;
        uint256 gl = tickGasLimit;
        try s.getQuote(target, gl) returns (uint256 fee) {
            if (address(this).balance < fee) { emit ArmFailed(target); return; }
            try s.schedule{value: fee}(target, address(this), 0, gl, abi.encodeCall(this.tick, ())) returns (uint64 h) {
                armedBlock = target;
                emit Armed(target, h);
            } catch { emit ArmFailed(target); }
        } catch { emit ArmFailed(target); }
    }

    // ------------------------------------------------------------ admin

    function setScheduler(address s, uint256 gasLimit_) external onlyAdmin { scheduler = IScheduler(s); tickGasLimit = gasLimit_; }
    function setBounty(uint256 b) external onlyAdmin { bounty = b; }
    function setPointsSetter(address p) external onlyAdmin { pointsSetter = p; }
    function setAdmin(address a) external onlyAdmin { admin = a; }
    function setNextMonth(uint256 m) external onlyAdmin { nextMonth = m; }

    /// Ownable2Step on the pool: the admin starts the transfer, this accepts it.
    function acceptPoolOwnership() external onlyAdmin { pool.acceptOwnership(); }

    /// Keeps every owner-only function of V6 / the pool reachable while this contract owns them.
    function adminCall(address target, bytes calldata data) external onlyAdmin nonReentrant returns (bytes memory) {
        if (target != address(sub) && target != address(pool)) revert BadTarget();
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) assembly { revert(add(ret, 32), mload(ret)) }
        return ret;
    }

    function returnOwnership(address to) external onlyAdmin {
        sub.transferOwnership(to);
        pool.transferOwnership(to);   // Ownable2Step: `to` must accept
    }

    function sweepNative(address payable to, uint256 amount) external onlyAdmin {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "sweep");
    }
}
