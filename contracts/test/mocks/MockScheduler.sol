// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;


/// Mock of the scheduled-tx precompile:
///  - prepaid fee: capacity fee = baseFee * gas * (1 + (M-1) * used/CAP) + storage fee, no refund for unused gas
///  - per-block scheduled-lane capacity CAP
///  - value escrow until execution / cancel
///  - owner-only cancel, refund value + BETA of fee
///  - execution at "end of block" via process(), status Completed even if the call reverts
contract MockScheduler {
    enum Status { Unknown, Pending, Cancelled, Completed }
    struct Tx { address owner; address to; uint256 value; uint64 gasLimit; uint64 targetBlock; uint256 fee; Status status; bytes data; }

    uint256 public constant CAP = 5_000_000;
    uint256 public constant MIN_WINDOW = 2;
    uint256 public immutable MAX_WINDOW;
    uint256 public constant M = 4;
    uint256 public constant STORAGE_FEE = 1e12;
    uint256 public constant BETA_BPS = 5000;

    uint256 public baseFee = 50 gwei;
    address public immutable admin;
    mapping(uint64 => Tx) internal txs;
    mapping(uint256 => uint64[]) internal byBlock;
    mapping(uint256 => uint256) public used;
    uint256[] internal activeBlocks;
    mapping(uint256 => bool) internal isActive;
    uint64 public nextHandle = 1;
    address public currentOwner;
    uint64 public currentHandle;
    uint256 public escrowed;
    uint256 public feesCollected;
    uint256 public executedCount;

    error LaneFull(); error BadWindow(); error Underpaid(uint256 need); error NotOwner(); error NotPending();
    event Scheduled(uint64 indexed h, address indexed owner, uint256 targetBlock, uint256 fee);
    event Executed(uint64 indexed h, bool ok);
    event Cancelled(uint64 indexed h, uint256 refund);

    constructor(uint256 maxWindow) { admin = msg.sender; MAX_WINDOW = maxWindow; }

    function setBaseFee(uint256 b) external { require(msg.sender == admin, "admin"); baseFee = b; }

    function getQuote(uint256 targetBlock, uint256 gasLimit) public view returns (uint256) {
        return baseFee * gasLimit * (CAP + (M - 1) * used[targetBlock]) / CAP + STORAGE_FEE;
    }

    function schedule(uint256 targetBlock, address to, uint256 value, uint256 gasLimit, bytes calldata data)
        external payable returns (uint64 h)
    {
        if (targetBlock < block.number + MIN_WINDOW || targetBlock > block.number + MAX_WINDOW) revert BadWindow();
        if (used[targetBlock] + gasLimit > CAP) revert LaneFull();
        uint256 fee = getQuote(targetBlock, gasLimit);
        if (msg.value != fee + value) revert Underpaid(fee + value);
        used[targetBlock] += gasLimit;
        h = nextHandle++;
        txs[h] = Tx(msg.sender, to, value, uint64(gasLimit), uint64(targetBlock), fee, Status.Pending, data);
        byBlock[targetBlock].push(h);
        if (!isActive[targetBlock]) { isActive[targetBlock] = true; activeBlocks.push(targetBlock); }
        escrowed += value;
        feesCollected += fee;
        emit Scheduled(h, msg.sender, targetBlock, fee);
    }

    function cancel(uint64 h) external {
        Tx storage t = txs[h];
        if (t.owner != msg.sender) revert NotOwner();
        if (t.status != Status.Pending || block.number > t.targetBlock) revert NotPending();
        t.status = Status.Cancelled;
        used[t.targetBlock] -= t.gasLimit;
        uint256 refund = t.value + t.fee * BETA_BPS / 10_000;
        escrowed -= t.value;
        feesCollected -= t.fee * BETA_BPS / 10_000;
        emit Cancelled(h, refund);
        (bool ok,) = msg.sender.call{value: refund}("");
        require(ok, "refund");
    }

    function getStatus(uint64 h) external view returns (Status) { return txs[h].status; }
    function txOf(uint64 h) external view returns (Tx memory) { return txs[h]; }

    function nextActiveBlock() external view returns (uint256 best) {
        best = type(uint256).max;
        for (uint256 i; i < activeBlocks.length; i++) if (activeBlocks[i] < best) best = activeBlocks[i];
    }

    /// "End of block" execution of every due tx with targetBlock <= block.number, ascending.
    function process() external {
        while (true) {
            uint256 idx = type(uint256).max; uint256 b = type(uint256).max;
            for (uint256 i; i < activeBlocks.length; i++) if (activeBlocks[i] < b) { b = activeBlocks[i]; idx = i; }
            if (idx == type(uint256).max || b > block.number) return;
            activeBlocks[idx] = activeBlocks[activeBlocks.length - 1];
            activeBlocks.pop();
            isActive[b] = false;
            uint64[] memory hs = byBlock[b];
            delete byBlock[b];
            for (uint256 j; j < hs.length; j++) _exec(hs[j]);
        }
    }

    function _exec(uint64 h) internal {
        Tx storage t = txs[h];
        if (t.status != Status.Pending) return;
        t.status = Status.Completed; // before the call: no double execution even on reentry
        escrowed -= t.value;
        executedCount++;
        (address prevO, uint64 prevH) = (currentOwner, currentHandle);
        currentOwner = t.owner; currentHandle = h;
        (bool ok,) = t.to.call{gas: t.gasLimit, value: t.value}(t.data);
        currentOwner = prevO; currentHandle = prevH;
        emit Executed(h, ok);
    }
}
