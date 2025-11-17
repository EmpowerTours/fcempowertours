// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SimpleLiquidityPool
 * @notice Simple constant-product AMM (x * y = k) for TOURS/WMON trading
 * @dev Based on Uniswap V2 math, simplified for a single pool
 *
 * How it works:
 * - Liquidity providers deposit equal value of TOURS and WMON
 * - Receive LP tokens representing their share of the pool
 * - Traders swap TOURS <-> WMON with 0.3% fee
 * - Fees accumulate in the pool, increasing LP token value
 */
contract SimpleLiquidityPool is ERC20, ReentrancyGuard {

    // ========================================================================
    // STATE
    // ========================================================================

    IERC20 public immutable tours;     // TOURS token
    IERC20 public immutable wmon;      // Wrapped MON token

    uint256 public reserveTours;       // TOURS reserve
    uint256 public reserveWMON;        // WMON reserve

    uint256 public constant FEE_PERCENT = 3;      // 0.3% fee (3/1000)
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant MINIMUM_LIQUIDITY = 1000; // Minimum liquidity locked forever

    // ========================================================================
    // EVENTS
    // ========================================================================

    event LiquidityAdded(
        address indexed provider,
        uint256 toursAmount,
        uint256 wmonAmount,
        uint256 liquidity
    );

    event LiquidityRemoved(
        address indexed provider,
        uint256 toursAmount,
        uint256 wmonAmount,
        uint256 liquidity
    );

    event Swap(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event ReservesUpdated(uint256 reserveTours, uint256 reserveWMON);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _tours,
        address _wmon
    ) ERC20("TOURS-WMON LP", "TOURS-WMON") {
        require(_tours != address(0), "Invalid TOURS address");
        require(_wmon != address(0), "Invalid WMON address");
        tours = IERC20(_tours);
        wmon = IERC20(_wmon);
    }

    // ========================================================================
    // LIQUIDITY FUNCTIONS
    // ========================================================================

    /**
     * @notice Add liquidity to the pool
     * @param toursAmount Amount of TOURS to add
     * @param wmonAmount Amount of WMON to add
     * @param minLiquidity Minimum LP tokens to receive (slippage protection)
     * @return liquidity Amount of LP tokens minted
     */
    function addLiquidity(
        uint256 toursAmount,
        uint256 wmonAmount,
        uint256 minLiquidity
    ) external nonReentrant returns (uint256 liquidity) {
        require(toursAmount > 0 && wmonAmount > 0, "Amounts must be > 0");

        // Transfer tokens to pool
        tours.transferFrom(msg.sender, address(this), toursAmount);
        wmon.transferFrom(msg.sender, address(this), wmonAmount);

        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            // First liquidity provision
            liquidity = Math.sqrt(toursAmount * wmonAmount) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY); // Lock minimum liquidity forever
        } else {
            // Subsequent liquidity provision - maintain ratio
            liquidity = Math.min(
                (toursAmount * _totalSupply) / reserveTours,
                (wmonAmount * _totalSupply) / reserveWMON
            );
        }

        require(liquidity >= minLiquidity, "Slippage: insufficient liquidity minted");
        require(liquidity > 0, "Insufficient liquidity minted");

        _mint(msg.sender, liquidity);

        // Update reserves
        _updateReserves();

        emit LiquidityAdded(msg.sender, toursAmount, wmonAmount, liquidity);
    }

    /**
     * @notice Remove liquidity from the pool
     * @param liquidity Amount of LP tokens to burn
     * @param minTours Minimum TOURS to receive (slippage protection)
     * @param minWMON Minimum WMON to receive (slippage protection)
     * @return toursAmount Amount of TOURS received
     * @return wmonAmount Amount of WMON received
     */
    function removeLiquidity(
        uint256 liquidity,
        uint256 minTours,
        uint256 minWMON
    ) external nonReentrant returns (uint256 toursAmount, uint256 wmonAmount) {
        require(liquidity > 0, "Liquidity must be > 0");
        require(balanceOf(msg.sender) >= liquidity, "Insufficient LP tokens");

        uint256 _totalSupply = totalSupply();

        // Calculate amounts to return proportional to LP tokens
        toursAmount = (liquidity * reserveTours) / _totalSupply;
        wmonAmount = (liquidity * reserveWMON) / _totalSupply;

        require(toursAmount >= minTours, "Slippage: insufficient TOURS");
        require(wmonAmount >= minWMON, "Slippage: insufficient WMON");
        require(toursAmount > 0 && wmonAmount > 0, "Insufficient liquidity burned");

        // Burn LP tokens
        _burn(msg.sender, liquidity);

        // Transfer tokens to provider
        tours.transfer(msg.sender, toursAmount);
        wmon.transfer(msg.sender, wmonAmount);

        // Update reserves
        _updateReserves();

        emit LiquidityRemoved(msg.sender, toursAmount, wmonAmount, liquidity);
    }

    // ========================================================================
    // SWAP FUNCTIONS
    // ========================================================================

    /**
     * @notice Swap TOURS for WMON
     * @param toursIn Amount of TOURS to swap
     * @param minWMONOut Minimum WMON to receive (slippage protection)
     * @return wmonOut Amount of WMON received
     */
    function swapToursForWMON(
        uint256 toursIn,
        uint256 minWMONOut
    ) external nonReentrant returns (uint256 wmonOut) {
        require(toursIn > 0, "Amount must be > 0");
        require(reserveTours > 0 && reserveWMON > 0, "Insufficient liquidity");

        // Transfer TOURS in
        tours.transferFrom(msg.sender, address(this), toursIn);

        // Calculate output with fee (0.3%)
        wmonOut = _getAmountOut(toursIn, reserveTours, reserveWMON);
        require(wmonOut >= minWMONOut, "Slippage: insufficient output");
        require(wmonOut < reserveWMON, "Insufficient WMON liquidity");

        // Transfer WMON out
        wmon.transfer(msg.sender, wmonOut);

        // Update reserves
        _updateReserves();

        emit Swap(msg.sender, address(tours), address(wmon), toursIn, wmonOut);
    }

    /**
     * @notice Swap WMON for TOURS
     * @param wmonIn Amount of WMON to swap
     * @param minToursOut Minimum TOURS to receive (slippage protection)
     * @return toursOut Amount of TOURS received
     */
    function swapWMONForTours(
        uint256 wmonIn,
        uint256 minToursOut
    ) external nonReentrant returns (uint256 toursOut) {
        require(wmonIn > 0, "Amount must be > 0");
        require(reserveTours > 0 && reserveWMON > 0, "Insufficient liquidity");

        // Transfer WMON in
        wmon.transferFrom(msg.sender, address(this), wmonIn);

        // Calculate output with fee (0.3%)
        toursOut = _getAmountOut(wmonIn, reserveWMON, reserveTours);
        require(toursOut >= minToursOut, "Slippage: insufficient output");
        require(toursOut < reserveTours, "Insufficient TOURS liquidity");

        // Transfer TOURS out
        tours.transfer(msg.sender, toursOut);

        // Update reserves
        _updateReserves();

        emit Swap(msg.sender, address(wmon), address(tours), wmonIn, toursOut);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @notice Get quote for swapping TOURS -> WMON
     * @param toursIn Amount of TOURS to swap
     * @return wmonOut Expected WMON output
     */
    function getToursToWMONQuote(uint256 toursIn) external view returns (uint256 wmonOut) {
        require(reserveTours > 0 && reserveWMON > 0, "No liquidity");
        return _getAmountOut(toursIn, reserveTours, reserveWMON);
    }

    /**
     * @notice Get quote for swapping WMON -> TOURS
     * @param wmonIn Amount of WMON to swap
     * @return toursOut Expected TOURS output
     */
    function getWMONToToursQuote(uint256 wmonIn) external view returns (uint256 toursOut) {
        require(reserveTours > 0 && reserveWMON > 0, "No liquidity");
        return _getAmountOut(wmonIn, reserveWMON, reserveTours);
    }

    /**
     * @notice Get current reserves
     * @return _reserveTours TOURS reserve
     * @return _reserveWMON WMON reserve
     */
    function getReserves() external view returns (uint256 _reserveTours, uint256 _reserveWMON) {
        return (reserveTours, reserveWMON);
    }

    /**
     * @notice Get current price (WMON per TOURS)
     * @return price Price in 18 decimals
     */
    function getPrice() external view returns (uint256 price) {
        require(reserveTours > 0, "No liquidity");
        return (reserveWMON * 1e18) / reserveTours;
    }

    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================

    /**
     * @notice Calculate output amount using constant product formula with fee
     * @param amountIn Input amount
     * @param reserveIn Input token reserve
     * @param reserveOut Output token reserve
     * @return amountOut Output amount after fee
     */
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // Apply 0.3% fee: amountInWithFee = amountIn * 997
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_PERCENT);

        // Constant product formula: x * y = k
        // amountOut = (reserveOut * amountInWithFee) / (reserveIn * 1000 + amountInWithFee)
        uint256 numerator = reserveOut * amountInWithFee;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;

        amountOut = numerator / denominator;
    }

    /**
     * @notice Update reserves to match current balances
     */
    function _updateReserves() internal {
        reserveTours = tours.balanceOf(address(this));
        reserveWMON = wmon.balanceOf(address(this));
        emit ReservesUpdated(reserveTours, reserveWMON);
    }
}
