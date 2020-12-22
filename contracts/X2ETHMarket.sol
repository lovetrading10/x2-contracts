// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2FeeReceiver.sol";
import "./interfaces/IX2PriceFeed.sol";
import "./interfaces/IX2Token.sol";

contract X2ETHMarket is ReentrancyGuard {
    using SafeMath for uint256;

    // use a single storage slot
    uint64 public previousBullDivisor;
    uint64 public previousBearDivisor;
    uint64 public cachedBullDivisor;
    uint64 public cachedBearDivisor;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    // max uint256 has 77 digits, with an initial rebase divisor of 10^20
    // and assuming 18 decimals for tokens, collateral tokens with a supply
    // of up to 39 digits can be supported
    uint64 public constant INITIAL_REBASE_DIVISOR = 10**10;
    uint256 public constant MAX_DIVISOR = uint64(-1);

    address public factory;

    address public weth;
    address public bullToken;
    address public bearToken;
    address public priceFeed;
    uint256 public multiplierBasisPoints;
    uint256 public maxProfitBasisPoints;
    uint256 public lastPrice;

    uint256 public feeReserve;

    bool public isInitialized;

    modifier onlyFactory() {
        require(msg.sender == factory, "X2ETHMarket: forbidden");
        _;
    }

    function initialize(
        address _factory,
        address _priceFeed,
        uint256 _multiplierBasisPoints,
        uint256 _maxProfitBasisPoints
    ) public {
        require(!isInitialized, "X2ETHMarket: already initialized");
        isInitialized = true;

        factory = _factory;
        priceFeed = _priceFeed;
        multiplierBasisPoints = _multiplierBasisPoints;
        maxProfitBasisPoints = _maxProfitBasisPoints;

        lastPrice = latestPrice();
        require(lastPrice != 0, "X2ETHMarket: unsupported price feed");
    }

    function setBullToken(address _bullToken) public onlyFactory {
        require(bullToken == address(0), "X2ETHMarket: bullToken already set");
        bullToken = _bullToken;
        previousBullDivisor = INITIAL_REBASE_DIVISOR;
        cachedBullDivisor = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2ETHMarket: bearToken already set");
        bearToken = _bearToken;
        previousBearDivisor = INITIAL_REBASE_DIVISOR;
        cachedBearDivisor = INITIAL_REBASE_DIVISOR;
    }

    function buy(address _token, address _receiver) public payable nonReentrant returns (uint256) {
        bool isBull = _token == bullToken;
        require(isBull || _token == bearToken, "X2ETHMarket: unsupported token");
        uint256 amount = msg.value;
        require(amount > 0, "X2ETHMarket: insufficient collateral sent");

        rebase();

        uint256 fee = _collectFees(amount);
        uint256 depositAmount = amount.sub(fee);
        IX2Token(_token).mint(_receiver, depositAmount, isBull ? cachedBullDivisor : cachedBearDivisor);

        return depositAmount;
    }

    function sell(address _token, uint256 _amount, address _receiver) public nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2ETHMarket: unsupported token");
        rebase();

        IX2Token(_token).burn(msg.sender, _amount);

        uint256 fee = _collectFees(_amount);
        uint256 withdrawAmount = _amount.sub(fee);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2ETHMarket: eth transfer failed");

        return withdrawAmount;
    }

    function rebase() public returns (bool) {
        uint256 nextPrice = latestPrice();
        if (nextPrice == lastPrice) { return false; }

        // store the divisor values as updating cachedDivisors will change the
        // value returned from getRebaseDivisor
        uint256 bullDivisor = getRebaseDivisor(true);
        uint256 bearDivisor = getRebaseDivisor(false);

        if (bullDivisor > MAX_DIVISOR || bearDivisor > MAX_DIVISOR) {
            return false;
        }

        previousBullDivisor = cachedBullDivisor;
        previousBearDivisor = cachedBearDivisor;

        cachedBullDivisor = uint64(bullDivisor);
        cachedBearDivisor = uint64(bearDivisor);

        lastPrice = nextPrice;

        return true;
    }

    function getDivisor(address _token) public view returns (uint256) {
        uint256 nextPrice = latestPrice();
        bool isBull = _token == bullToken;

        // if the price has moved then on rebase the previousDivisor
        // will have the current cachedDivisor's value
        // and the cachedDivisor will have the rebaseDivisor's value
        // so we should only compare these two values for this case
        if (nextPrice != lastPrice) {
            uint256 cachedDivisor = isBull ? cachedBullDivisor : cachedBearDivisor;
            uint256 rebaseDivisor = getRebaseDivisor(isBull);
            // return the largest divisor to prevent manipulation
            return cachedDivisor > rebaseDivisor ? cachedDivisor : rebaseDivisor;
        }

        uint256 previousDivisor = isBull ? previousBullDivisor : previousBearDivisor;
        uint256 cachedDivisor = isBull ? cachedBullDivisor : cachedBearDivisor;
        uint256 rebaseDivisor = getRebaseDivisor(isBull);
        // return the largest divisor to prevent manipulation
        if (previousDivisor > cachedDivisor && previousDivisor > rebaseDivisor) {
            return previousDivisor;
        }
        return cachedDivisor > rebaseDivisor ? cachedDivisor : rebaseDivisor;
    }

    function latestPrice() public view returns (uint256) {
        uint256 answer = IX2PriceFeed(priceFeed).latestAnswer();
        // prevent zero from being returned
        return answer == 0 ? lastPrice : answer;
    }

    function getRebaseDivisor(bool isBull) public view returns (uint256) {
        address _bullToken = bullToken;
        address _bearToken = bearToken;

        uint256 _lastPrice = lastPrice;
        uint256 nextPrice = latestPrice();

        if (nextPrice == _lastPrice) {
            return isBull ? cachedBullDivisor : cachedBearDivisor;
        }

        uint256 bullRefSupply = IX2Token(_bullToken)._totalSupply();
        uint256 bearRefSupply = IX2Token(_bearToken)._totalSupply();
        uint256 totalBulls = bullRefSupply.div(cachedBullDivisor);
        uint256 totalBears = bearRefSupply.div(cachedBearDivisor);

        uint256 profit;

        {
        // refSupply is the smaller of the two supplies
        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 delta = nextPrice > _lastPrice ? nextPrice.sub(_lastPrice) : _lastPrice.sub(nextPrice);
        // profit is [(smaller supply) * (change in price) / (last price)] * multiplierBasisPoints
        profit = refSupply.mul(delta).div(_lastPrice).mul(multiplierBasisPoints).div(BASIS_POINTS_DIVISOR);

        // cap the profit to the (max profit percentage) of the smaller supply
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        if (profit > maxProfit) { profit = maxProfit; }
        }

        if (isBull) {
            uint256 nextSupply = nextPrice > _lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
            return _getNextDivisor(bullRefSupply, nextSupply, isBull);
        }

        uint256 nextSupply = nextPrice > _lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
        return _getNextDivisor(bearRefSupply, nextSupply, isBull);
    }

    function _getNextDivisor(uint256 _refSupply, uint256 _nextSupply, bool isBull) private view returns (uint256) {
        if (_nextSupply == 0) {
            return INITIAL_REBASE_DIVISOR;
        }

        uint256 divisor = _refSupply.div(_nextSupply);
        // prevent the cachedDivisor from being set to 0
        if (divisor == 0) { return isBull ? cachedBullDivisor : cachedBearDivisor; }

        return divisor;
    }

    function _collectFees(uint256 _amount) private returns (uint256) {
        uint256 fee = IX2Factory(factory).getFee(address(this), _amount);
        if (fee == 0) { return 0; }

        feeReserve = feeReserve.add(fee);
        return fee;
    }
}
