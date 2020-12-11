// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2FeeReceiver.sol";
import "./interfaces/IX2PriceFeed.sol";
import "./interfaces/IX2Token.sol";

contract X2Market is IX2Market, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    // max uint256 has 77 digits, with an initial rebase divisor of 10^20
    // and assuming 18 decimals for regular tokens, collateral tokens with a supply
    // of up to 39 digits can be supported
    uint256 public constant INITIAL_REBASE_DIVISOR = 10**20;

    address public factory;

    address public override collateralToken;
    address public feeToken;
    address public override bullToken;
    address public override bearToken;
    address public priceFeed;
    uint256 public multiplier;
    uint256 public unlockDelay;
    uint256 public maxProfitBasisPoints;
    uint256 public minDeltaBasisPoints;
    uint256 public lastPrice;

    uint256 public feeReserve;

    uint256 public collateralTokenBalance;
    uint256 public feeTokenBalance;

    bool public isInitialized;

    mapping (address => uint256) public previousDivisors;
    mapping (address => uint256) public cachedDivisors;

    event Fee(uint256 fee, uint256 subsidy);
    event PriceChange(uint256 price);
    event DistributeFees(uint256 fees);

    modifier onlyFactory() {
        require(msg.sender == factory, "X2Market: forbidden");
        _;
    }

    function initialize(
        address _factory,
        address _collateralToken,
        address _feeToken,
        address _priceFeed,
        uint256 _multiplier,
        uint256 _unlockDelay,
        uint256 _maxProfitBasisPoints,
        uint256 _minDeltaBasisPoints
    ) public {
        require(!isInitialized, "X2Market: already initialized");
        isInitialized = true;

        factory = _factory;
        collateralToken = _collateralToken;
        feeToken = _feeToken;
        priceFeed = _priceFeed;
        multiplier = _multiplier;
        unlockDelay = _unlockDelay;
        maxProfitBasisPoints = _maxProfitBasisPoints;
        minDeltaBasisPoints = _minDeltaBasisPoints;

        lastPrice = latestPrice();
        require(lastPrice != 0, "X2Market: unsupported price feed");
    }

    function setBullToken(address _bullToken) public onlyFactory {
        require(bullToken == address(0), "X2Market: bullToken already set");
        bullToken = _bullToken;
        previousDivisors[bullToken] = INITIAL_REBASE_DIVISOR;
        cachedDivisors[bullToken] = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2Market: bearToken already set");
        bearToken = _bearToken;
        previousDivisors[bearToken] = INITIAL_REBASE_DIVISOR;
        cachedDivisors[bearToken] = INITIAL_REBASE_DIVISOR;
    }

    function deposit(address _token, uint256 _amount, uint256 _feeSubsidy, address _receiver) public override nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");
        require(_getCollateralTokenBalance().sub(collateralTokenBalance) == _amount);
        if (_feeSubsidy > 0) {
            require(_getFeeTokenBalance().sub(feeTokenBalance) == _feeSubsidy);
        }

        rebase();

        uint256 fee = _collectFees(_amount, _feeSubsidy);
        uint256 depositAmount = _amount.sub(fee);
        IX2Token(_token).mint(_receiver, depositAmount);

        _updateBalances();

        return depositAmount;
    }

    function withdraw(address _token, uint256 _amount, address _receiver) public override nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");
        rebase();

        uint256 divisor = getDivisor(_token);
        uint256 cachedDivisor = cachedDivisors[_token];

        if (divisor > cachedDivisor) {
            uint256 scaledAmount = _amount.mul(divisor).div(cachedDivisor);
            uint256 interest = scaledAmount.sub(_amount);
            feeReserve = feeReserve.add(interest);
        }

        IX2Token(_token).burn(msg.sender, _amount);

        uint256 fee = _collectFees(_amount, 0);
        uint256 withdrawAmount = _amount.sub(fee);
        IERC20(collateralToken).safeTransfer(_receiver, withdrawAmount);

        _updateBalances();

        return withdrawAmount;
    }

    function getNextUnlockTime() public override view returns (uint256) {
        return block.timestamp.add(unlockDelay);
    }

    function distributeFees() public nonReentrant {
        address feeReceiver = IX2Factory(factory).feeReceiver();
        require(feeReceiver != address(0), "X2Market: empty feeReceiver");

        IERC20(collateralToken).safeTransfer(feeReceiver, feeReserve);
        IX2FeeReceiver(feeReceiver).notifyFees(collateralToken, feeReserve);
        emit DistributeFees(feeReserve);
        feeReserve = 0;
    }

    function rebase() public override returns (bool) {
        uint256 nextPrice = latestPrice();
        if (nextPrice == lastPrice) { return false; }

        // store the divisor values as updating cachedDivisors will change the
        // value returned from getRebaseDivisor
        uint256 bullDivisor = getRebaseDivisor(bullToken);
        uint256 bearDivisor = getRebaseDivisor(bearToken);

        previousDivisors[bullToken] = cachedDivisors[bullToken];
        previousDivisors[bearToken] = cachedDivisors[bearToken];

        cachedDivisors[bullToken] = bullDivisor;
        cachedDivisors[bearToken] = bearDivisor;

        lastPrice = nextPrice;
        emit PriceChange(nextPrice);

        return true;
    }

    function latestPrice() public view override returns (uint256) {
        uint256 answer = IX2PriceFeed(priceFeed).latestAnswer();
        // prevent zero from being returned
        if (answer == 0) { return lastPrice; }

        // prevent price from moving too often
        uint256 _lastPrice = lastPrice;
        uint256 minDelta = _lastPrice.mul(minDeltaBasisPoints).div(BASIS_POINTS_DIVISOR);
        uint256 delta = answer > _lastPrice ? answer.sub(_lastPrice) : _lastPrice.sub(answer);
        if (delta <= minDelta) { return _lastPrice; }

        return answer;
    }

    function getDivisor(address _token) public override view returns (uint256) {
        uint256 previousDivisor = previousDivisors[_token];
        uint256 cachedDivisor = cachedDivisors[_token];
        uint256 rebaseDivisor = getRebaseDivisor(_token);
        // use the largest divisor to prevent manipulation
        if (previousDivisor > cachedDivisor && previousDivisor > rebaseDivisor) {
            return previousDivisor;
        }
        return cachedDivisor > rebaseDivisor ? cachedDivisor : rebaseDivisor;
    }

    function getRebaseDivisor(address _token) public view returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");

        uint256 totalBulls = cachedTotalSupply(bullToken);
        uint256 totalBears = cachedTotalSupply(bearToken);

        uint256 _lastPrice = lastPrice;
        uint256 nextPrice = latestPrice();

        if (nextPrice == _lastPrice) {
            return cachedDivisors[_token];
        }

        // refSupply is the smaller of the two supplies
        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 delta = nextPrice > _lastPrice ? nextPrice.sub(_lastPrice) : _lastPrice.sub(nextPrice);
        // profit is [(smaller supply) * (change in price) / (last price)] * multiplier
        uint256 profit = refSupply.mul(delta).div(_lastPrice).mul(multiplier);

        // cap the profit to the (max profit percentage) of the smaller supply
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        if (profit > maxProfit) { profit = maxProfit; }

        if (_token == bullToken) {
            uint256 nextSupply = nextPrice > _lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
            return _getNextDivisor(_token, nextSupply);
        }

        uint256 nextSupply = nextPrice > _lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
        return _getNextDivisor(_token, nextSupply);
    }

    function cachedTotalSupply(address _token) public view returns (uint256) {
        return IX2Token(_token)._totalSupply().div(cachedDivisors[_token]);
    }

    function _getNextDivisor(address _token, uint256 _nextSupply) private view returns (uint256) {
        if (_nextSupply == 0) {
            return INITIAL_REBASE_DIVISOR;
        }

        uint256 divisor = IX2Token(_token)._totalSupply().div(_nextSupply);
        // prevent the cachedDivisor from being set to 0
        if (divisor == 0) { return cachedDivisors[_token]; }

        return divisor;
    }

    function _collectFees(uint256 _amount, uint256 _feeSubsidy) private returns (uint256) {
        uint256 fee = IX2Factory(factory).getFee(address(this), _amount);
        if (fee == 0) { return 0; }
        if (_feeSubsidy >= fee) { return 0; }

        fee = fee.sub(_feeSubsidy);
        feeReserve = feeReserve.add(fee);

        emit Fee(fee, _feeSubsidy);
        return fee;
    }

    function _updateBalances() private {
        feeTokenBalance = _getFeeTokenBalance();
        collateralTokenBalance = _getCollateralTokenBalance();
    }

    function _getCollateralTokenBalance() private view returns (uint256) {
        return IERC20(collateralToken).balanceOf(address(this));
    }

    function _getFeeTokenBalance() private view returns (uint256) {
        return IERC20(feeToken).balanceOf(address(this));
    }
}
