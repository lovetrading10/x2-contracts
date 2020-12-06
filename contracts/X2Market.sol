// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Router.sol";
import "./interfaces/IX2FeeReceiver.sol";
import "./interfaces/IX2PriceFeed.sol";
import "./interfaces/IX2Token.sol";

contract X2Market is IX2Market, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant INITIAL_REBASE_DIVISOR = 10**8;

    address public factory;
    address public router;

    address public override collateralToken;
    address public bullToken;
    address public bearToken;
    address public priceFeed;
    uint256 public interval;
    uint256 public unlockDelay;
    uint256 public maxProfitBasisPoints;

    uint256 public reserve;
    uint256 public feeReserve;
    uint256 public feeTokenReserve;

    uint256 public lastPrice;
    uint256 public nextRebaseTime;

    mapping (address => uint256) public cachedDivisors;
    mapping (address => uint256) public totalSupply;
    mapping (address => uint256) public _totalSupply;

    modifier onlyBullBearTokens() {
        require(msg.sender == bullToken || msg.sender == bearToken, "X2Market: forbidden");
        _;
    }

    constructor(
        address _factory,
        address _router,
        address _collateralToken,
        address _bullToken,
        address _bearToken,
        address _priceFeed,
        uint256 _interval,
        uint256 _unlockDelay,
        uint256 _maxProfitBasisPoints
    ) public {
        factory = _factory;
        router = _router;
        collateralToken = _collateralToken;
        bullToken = _bullToken;
        bearToken = _bearToken;
        priceFeed = _priceFeed;
        interval = _interval;
        unlockDelay = _unlockDelay;
        maxProfitBasisPoints = _maxProfitBasisPoints;

        cachedDivisors[bullToken] = INITIAL_REBASE_DIVISOR;
        cachedDivisors[bearToken] = INITIAL_REBASE_DIVISOR;

        lastPrice = latestPrice();
        _setNextRebaseTime();
    }

    function deposit(address _account, uint256 _amount) public override onlyBullBearTokens nonReentrant returns (uint256) {
        rebase();

        _collectFees(_amount);

        uint256 balance = IERC20(collateralToken).balanceOf(address(this));
        uint256 receivedAmount = balance.sub(reserve).sub(feeReserve);
        require(receivedAmount >= _amount, "X2Market: insufficient input amount");

        IX2Token(msg.sender).mint(_account, _amount);
        _updateReserve();
        return _amount;
    }

    function withdraw(address _account, address _receiver, uint256 _amount) public override onlyBullBearTokens nonReentrant returns (uint256) {
        rebase();

        uint256 fee = _collectFees(_amount);

        uint256 withdrawAmount = _amount.sub(fee);
        IERC20(collateralToken).safeTransfer(_receiver, withdrawAmount);

        IX2Token(msg.sender).burn(_account, _amount);
        _updateReserve();
        return withdrawAmount;
    }

    function getNextUnlockTime() public override view returns (uint256) {
        return block.timestamp.add(unlockDelay);
    }

    function distributeFees() public nonReentrant {
        address feeReceiver = IX2Factory(factory).feeReceiver();
        require(feeReceiver != address(0), "X2Market: empty feeReceiver");

        feeReserve = 0;
        IERC20(collateralToken).safeTransfer(feeReceiver, feeReserve);
        IX2FeeReceiver(feeReceiver).notifyFees(collateralToken, feeReserve);
    }

    function rebase() public override returns (bool) {
        if (block.timestamp < nextRebaseTime) { return false; }
        _setNextRebaseTime();

        cachedDivisors[bullToken] = getDivisor(bullToken);
        cachedDivisors[bearToken] = getDivisor(bearToken);

        totalSupply[bullToken] = IERC20(bullToken).totalSupply();
        totalSupply[bearToken] = IERC20(bearToken).totalSupply();

        _totalSupply[bullToken] = IX2Token(bullToken)._totalSupply();
        _totalSupply[bearToken] = IX2Token(bearToken)._totalSupply();
    }

    function latestPrice() public view returns (uint256) {
        return IX2PriceFeed(priceFeed).latestAnswer();
    }

    function getDivisor(address _token) public override view returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");

        uint256 totalBulls = totalSupply[bullToken];
        uint256 totalBears = totalSupply[bearToken];

        uint256 nextPrice = latestPrice();

        if (nextPrice == lastPrice) {
            return cachedDivisors[_token];
        }

        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        uint256 movement = nextPrice > lastPrice ? nextPrice.sub(lastPrice) : lastPrice.sub(nextPrice);
        uint256 profit = refSupply.mul(movement).div(lastPrice);

        if (profit > maxProfit) { profit = maxProfit; }

        if (_token == bullToken) {
            uint256 nextSupply = nextPrice > lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
            return _getNextDivisor(_token, nextSupply);
        }

        uint256 nextSupply = nextPrice > lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
        return _getNextDivisor(_token, nextSupply);
    }

    function _getNextDivisor(address _token, uint256 _nextSupply) private view returns (uint256) {
        return _totalSupply[_token].div(_nextSupply);
    }

    function _setNextRebaseTime() private {
        uint256 roundedTime = block.timestamp.div(interval).mul(interval);
        nextRebaseTime = roundedTime.add(interval);
    }

    function _updateReserve() private {
        reserve = IERC20(collateralToken).balanceOf(address(this)).sub(feeReserve);
    }

    function _collectFees(uint256 _amount) private returns (uint256) {
        uint256 fee = IX2Factory(factory).getFee(_amount);

        if (collateralToken == IX2Router(router).weth()) {
            address feeToken = IX2Factory(factory).feeToken();
            uint256 feeTokenBalance = IERC20(feeToken).balanceOf(address(this));
            uint256 subsidy = feeTokenBalance.sub(feeTokenReserve);
            fee = subsidy < fee ? fee.sub(subsidy) : 0;
            feeTokenReserve = feeTokenBalance;
        }

        feeReserve = feeReserve.add(fee);
        return fee;
    }
}
