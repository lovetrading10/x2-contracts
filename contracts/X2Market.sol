// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Factory.sol";

contract X2Market is IX2Market, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant DELAY_BASIS_POINTS = 15000;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant INITIAL_REBASE_DIVISOR = 10**8;

    address public factory;

    address public override collateralToken;
    address public bullToken;
    address public bearToken;
    uint256 public interval;

    uint256 public reserve;
    uint256 public feeReserve;
    uint256 public feeTokenReserve;

    mapping (address => uint256) public override divisors;

    modifier onlyBullBearTokens() {
        require(msg.sender == bullToken || msg.sender == bearToken, "X2Market: forbidden");
        _;
    }

    constructor(
        address _factory,
        address _collateralToken,
        address _bullToken,
        address _bearToken,
        uint256 _interval
    ) public {
        factory = _factory;
        collateralToken = _collateralToken;
        bullToken = _bullToken;
        bearToken = _bearToken;
        interval = _interval;

        divisors[bullToken] = INITIAL_REBASE_DIVISOR;
        divisors[bearToken] = INITIAL_REBASE_DIVISOR;
    }

    function deposit(uint256 _amount) public override onlyBullBearTokens nonReentrant returns (bool) {
        _collectFees(_amount);

        uint256 balance = IERC20(collateralToken).balanceOf(address(this));
        uint256 amount = balance.sub(reserve).sub(feeReserve);
        require(amount >= _amount, "X2Market: insufficient input amount");

        _updateReserve();
        return true;
    }

    function withdraw(address _receiver, uint256 _amount) public override onlyBullBearTokens nonReentrant returns (bool) {
        uint256 fee = _collectFees(_amount);

        uint256 withdrawAmount = _amount.sub(fee);
        IERC20(collateralToken).safeTransfer(_receiver, withdrawAmount);

        _updateReserve();
        return true;
    }

    function getNextUnlockTimestamp() public override view returns (uint256) {
        uint256 unlockDelay = interval.mul(DELAY_BASIS_POINTS).div(BASIS_POINTS_DIVISOR);
        return block.timestamp.add(unlockDelay);
    }

    function distributeFees() public nonReentrant {
        feeReserve = 0;
        IERC20(collateralToken).safeTransfer(factory, feeReserve);
        IX2Factory(factory).distributeFees(collateralToken);
    }

    function _updateReserve() private {
        reserve = IERC20(collateralToken).balanceOf(address(this)).sub(feeReserve);
    }

    function _collectFees(uint256 _amount) private returns (uint256) {
        address feeToken = IX2Factory(factory).feeToken();
        uint256 feeTokenBalance = IERC20(feeToken).balanceOf(address(this));
        uint256 subsidy = feeTokenBalance.sub(feeTokenReserve);

        uint256 fee = IX2Factory(factory).getFee(_amount);
        fee = subsidy < fee ? fee.sub(subsidy) : 0;

        feeReserve = feeReserve.add(fee.sub(subsidy));
        feeTokenReserve = feeTokenBalance;

        return fee;
    }
}
