// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2ETHFactory.sol";
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
    uint80 public lastRound;

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

        lastRound = latestRound();
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
        uint256 _lastPrice = lastPrice;
        uint256 nextPrice = latestPrice();
        if (nextPrice == _lastPrice) { return false; }

        // store the divisor values as updating cachedDivisors will change the
        // value returned from getRebaseDivisor
        uint256 bullDivisor = getRebaseDivisor(_lastPrice, nextPrice, true);
        uint256 bearDivisor = getRebaseDivisor(_lastPrice, nextPrice, false);

        if (bullDivisor > MAX_DIVISOR || bearDivisor > MAX_DIVISOR) {
            return false;
        }

        previousBullDivisor = cachedBullDivisor;
        previousBearDivisor = cachedBearDivisor;

        cachedBullDivisor = uint64(bullDivisor);
        cachedBearDivisor = uint64(bearDivisor);

        lastPrice = nextPrice;
        lastRound = latestRound();

        return true;
    }

    function getDivisor(address _token) public view returns (uint256) {
        uint256 _lastPrice = lastPrice;
        uint256 nextPrice = latestPrice();
        bool isBull = _token == bullToken;

        // if there have been two price updates since the lastRound
        // then we can settle balances based on the lower of the
        // last two values for bulls and the higher of the
        // last two values for bears
        {
        uint80 _lastRound = lastRound;
        if (_lastRound > lastRound + 1) {
            (bool ok, uint256 p0, uint256 p1) = getPrices(_lastRound - 1, _lastRound);
            if (ok) {
                nextPrice = isBull ? (p0 < p1 ? p0 : p1) : (p0 < p1 ? p1 : p0);
                return getRebaseDivisor(_lastPrice, nextPrice, isBull);
            }
        }
        }

        // if the price has moved then on rebase the previousDivisor
        // will have the current cachedDivisor's value
        // and the cachedDivisor will have the rebaseDivisor's value
        // so we should only compare these two values for this case
        if (nextPrice != _lastPrice) {
            uint256 cachedDivisor = isBull ? cachedBullDivisor : cachedBearDivisor;
            uint256 rebaseDivisor = getRebaseDivisor(_lastPrice, nextPrice, isBull);
            // return the largest divisor to prevent manipulation
            return cachedDivisor > rebaseDivisor ? cachedDivisor : rebaseDivisor;
        }

        uint256 previousDivisor = isBull ? previousBullDivisor : previousBearDivisor;
        uint256 cachedDivisor = isBull ? cachedBullDivisor : cachedBearDivisor;
        uint256 rebaseDivisor = getRebaseDivisor(_lastPrice, nextPrice, isBull);
        // return the largest divisor to prevent manipulation
        if (previousDivisor > cachedDivisor && previousDivisor > rebaseDivisor) {
            return previousDivisor;
        }
        return cachedDivisor > rebaseDivisor ? cachedDivisor : rebaseDivisor;
    }

    function getPrices(uint80 r0, uint80 r1) public view returns (bool, uint256, uint256) {
        address _priceFeed = priceFeed;
        (, int256 p0, , ,) = IX2PriceFeed(_priceFeed).getRoundData(r0);
        (, int256 p1, , ,) = IX2PriceFeed(_priceFeed).getRoundData(r1);

        if (p0 <= 0 || p1 <= 0) {
            return (false, 0, 0);
        }

        return (true, uint256(p0), uint256(p1));
    }

    function latestPrice() public view returns (uint256) {
        int256 answer = IX2PriceFeed(priceFeed).latestAnswer();
        // prevent zero or negative values from being returned
        return answer > 0 ? uint256(answer) : lastPrice;
    }

    function latestRound() public view returns (uint80) {
        return IX2PriceFeed(priceFeed).latestRound();
    }

    function getRebaseDivisor(uint256 _lastPrice, uint256 _nextPrice, bool _isBull) public view returns (uint256) {
        if (_nextPrice == _lastPrice) {
            return _isBull ? cachedBullDivisor : cachedBearDivisor;
        }

        uint256 bullRefSupply = IX2Token(bullToken)._totalSupply();
        uint256 bearRefSupply = IX2Token(bearToken)._totalSupply();
        uint256 totalBulls = bullRefSupply.div(cachedBullDivisor);
        uint256 totalBears = bearRefSupply.div(cachedBearDivisor);

        uint256 profit;

        // scope variables to avoid stack too deep errors
        {
        // refSupply is the smaller of the two supplies
        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 delta = _nextPrice > _lastPrice ? _nextPrice.sub(_lastPrice) : _lastPrice.sub(_nextPrice);
        // profit is [(smaller supply) * (change in price) / (last price)] * multiplierBasisPoints
        profit = refSupply.mul(delta).div(_lastPrice).mul(multiplierBasisPoints).div(BASIS_POINTS_DIVISOR);

        // cap the profit to the (max profit percentage) of the smaller supply
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        if (profit > maxProfit) { profit = maxProfit; }
        }

        if (_isBull) {
            uint256 nextSupply = _nextPrice > _lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
            return _getNextDivisor(bullRefSupply, nextSupply, _isBull);
        }

        uint256 nextSupply = _nextPrice > _lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
        return _getNextDivisor(bearRefSupply, nextSupply, _isBull);
    }

    function _getNextDivisor(uint256 _refSupply, uint256 _nextSupply, bool _isBull) private view returns (uint256) {
        if (_nextSupply == 0) {
            return INITIAL_REBASE_DIVISOR;
        }

        uint256 divisor = _refSupply.div(_nextSupply);
        // prevent the cachedDivisor from being set to 0
        if (divisor == 0) { return _isBull ? cachedBullDivisor : cachedBearDivisor; }

        return divisor;
    }

    function _collectFees(uint256 _amount) private returns (uint256) {
        uint256 fee = IX2ETHFactory(factory).getFee(address(this), _amount);
        if (fee == 0) { return 0; }

        feeReserve = feeReserve.add(fee);
        return fee;
    }
}
