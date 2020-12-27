// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";
import "./libraries/token/IERC20.sol";

import "./interfaces/IX2ETHFactory.sol";
import "./interfaces/IX2FeeReceiver.sol";
import "./interfaces/IX2PriceFeed.sol";
import "./interfaces/IX2Token.sol";

contract X2ETHMarket is ReentrancyGuard {
    using SafeMath for uint256;

    // use a single storage slot
    // max uint64 has 19 digits so it can support the INITIAL_REBASE_DIVISOR
    // increasing by 10^9 times
    uint64 public previousBullDivisor;
    uint64 public previousBearDivisor;
    uint64 public cachedBullDivisor;
    uint64 public cachedBearDivisor;

    // use a single storage slot
    // max uint176 can store prices up to 52 digits
    uint176 public lastPrice;
    uint80 public lastRound;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    // max uint128 has 38 digits, with an initial rebase divisor of 10^10
    // and 18 decimals for ETH, collateral of up to 10 billion ETH
    // can be supported
    uint64 public constant INITIAL_REBASE_DIVISOR = 10**10;
    uint256 public constant MAX_DIVISOR = uint64(-1);
    int256 public constant MAX_PRICE = uint176(-1);

    address public factory;

    address public weth;
    address public bullToken;
    address public bearToken;
    address public priceFeed;
    uint256 public multiplierBasisPoints;
    uint256 public maxProfitBasisPoints;

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

        lastPrice = uint176(latestPrice());
        require(lastPrice != 0, "X2ETHMarket: unsupported price feed");
    }

    function setBullToken(address _bullToken) public onlyFactory {
        require(bullToken == address(0), "X2ETHMarket: bullToken already set");
        bullToken = _bullToken;
        cachedBullDivisor = INITIAL_REBASE_DIVISOR;
        previousBullDivisor = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2ETHMarket: bearToken already set");
        bearToken = _bearToken;
        cachedBearDivisor = INITIAL_REBASE_DIVISOR;
        previousBearDivisor = INITIAL_REBASE_DIVISOR;
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

        IX2Token(_token).burn(msg.sender, _amount, true);

        uint256 fee = _collectFees(_amount);
        uint256 withdrawAmount = _amount.sub(fee);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2ETHMarket: transfer failed");

        return withdrawAmount;
    }

    function sellAll(address _token, address _receiver) public nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2ETHMarket: unsupported token");
        rebase();

        uint256 amount = IERC20(_token).balanceOf(msg.sender);
        IX2Token(_token).burn(msg.sender, amount, true);

        uint256 fee = _collectFees(amount);
        uint256 withdrawAmount = amount.sub(fee);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2ETHMarket: transfer failed");

        return withdrawAmount;
    }

    // since an X2Token's distributor can be set by the factory's gov,
    // the market should allow an option to sell the token without invoking
    // the distributor
    // this ensures that tokens can always be sold even if the distributor
    // is set to an address that intentionally fails when `distribute` is called
    function sellWithoutDistribution(address _token, uint256 _amount, address _receiver) public nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2ETHMarket: unsupported token");
        rebase();

        IX2Token(_token).burn(msg.sender, _amount, false);

        uint256 fee = _collectFees(_amount);
        uint256 withdrawAmount = _amount.sub(fee);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2ETHMarket: transfer failed");

        return withdrawAmount;
    }

    function rebase() public returns (bool) {
        uint256 nextPrice = latestPrice();
        uint80 _latestRound = latestRound();
        uint256 _lastRound = lastRound;
        if (_latestRound == _lastRound) { return false; }

        (uint256 _cachedBullDivisor, uint256 _cachedBearDivisor) = getDivisors(uint256(lastPrice), nextPrice);

        // avoid overflows
        if (_cachedBullDivisor > MAX_DIVISOR || _cachedBearDivisor > MAX_DIVISOR) {
            return false;
        }

        // the latest round is just one after the last recorded round
        // so update the previous divisors to the cached divisors
        // and update the cached divisors to the latest divisors
        if (_latestRound == _lastRound + 1) {
            lastPrice = uint176(nextPrice);
            lastRound = _latestRound;
            previousBullDivisor = cachedBullDivisor;
            previousBearDivisor = cachedBearDivisor;
            cachedBullDivisor = uint64(_cachedBullDivisor);
            cachedBearDivisor = uint64(_cachedBearDivisor);
            return true;
        }

        // if the previous price cannot be retrieved then do not rebase
        (bool ok, uint256 previousPrice) = getRoundPrice(_latestRound - 1);
        if (!ok) {
            return false;
        }

        (uint256 _previousBullDivisor, uint256 _previousBearDivisor) = getDivisors(uint256(lastPrice), previousPrice);

        // avoid overflows
        if (_previousBullDivisor > MAX_DIVISOR || _previousBearDivisor > MAX_DIVISOR) {
            return false;
        }

        lastPrice = uint176(nextPrice);
        lastRound = _latestRound;
        previousBullDivisor = uint64(_previousBullDivisor);
        previousBearDivisor = uint64(_previousBearDivisor);
        cachedBullDivisor = uint64(_cachedBullDivisor);
        cachedBearDivisor = uint64(_cachedBearDivisor);

        return true;
    }

    function distributeFees() public nonReentrant {
        address feeReceiver = IX2ETHFactory(factory).feeReceiver();
        require(feeReceiver != address(0), "X2Market: empty feeReceiver");

        uint256 fees = feeReserve;
        feeReserve = 0;

        (bool success,) = feeReceiver.call{value: fees}("");
        require(success, "X2ETHMarket: transfer failed");

        IX2FeeReceiver(feeReceiver).notifyETHFees(fees);
    }

    function distributeInterest() public nonReentrant {
        address feeReceiver = IX2ETHFactory(factory).feeReceiver();
        require(feeReceiver != address(0), "X2Market: empty feeReceiver");

        uint256 interest = interestReserve();

        (bool success,) = feeReceiver.call{value: interest}("");
        require(success, "X2ETHMarket: transfer failed");

        IX2FeeReceiver(feeReceiver).notifyETHInterest(interest);
    }

    function interestReserve() public view returns (uint256) {
        uint256 bullRefSupply = IX2Token(bullToken)._totalSupply();
        uint256 bearRefSupply = IX2Token(bearToken)._totalSupply();

        // the actual underlying supplies
        uint256 totalBulls = bullRefSupply.div(cachedBullDivisor);
        uint256 totalBears = bearRefSupply.div(cachedBearDivisor);

        uint256 balance = address(this).balance;
        return balance.sub(totalBulls).sub(totalBears).sub(feeReserve);
    }

    function getDivisor(address _token) public view returns (uint256) {
        uint80 _lastRound = lastRound;
        uint80 _latestRound = latestRound();
        bool isBull = _token == bullToken;

        // if the latest round is the same as the last recorded round
        // then select the largest divisor from the previous and cached divisors
        if (_latestRound == _lastRound) {
            if (isBull) {
                uint256 _cachedBullDivisor = uint256(cachedBullDivisor);
                uint256 _previousBullDivisor = uint256(previousBullDivisor);
                return _cachedBullDivisor > _previousBullDivisor ? _cachedBullDivisor : _previousBullDivisor;
            }
            uint256 _cachedBearDivisor = uint256(cachedBearDivisor);
            uint256 _previousBearDivisor = uint256(previousBearDivisor);
            return _cachedBearDivisor > _previousBearDivisor ? _cachedBearDivisor : _previousBearDivisor;
        }

        // if the latest round is just after the last recorded round
        // then select the largest divisor from the cached divisor and the
        // divisor for the next price
        uint256 _lastPrice = uint256(lastPrice);
        uint256 nextPrice = latestPrice();
        if (_latestRound == _lastRound + 1) {
            if (isBull) {
                uint256 _cachedBullDivisor = uint256(cachedBullDivisor);
                (uint256 nextBullDivisor,) = getDivisors(_lastPrice, nextPrice);
                return _cachedBullDivisor > nextBullDivisor ? _cachedBullDivisor : nextBullDivisor;
            }

            uint256 _cachedBearDivisor = uint256(cachedBearDivisor);
            (,uint256 nextBearDivisor) = getDivisors(_lastPrice, nextPrice);
            return _cachedBearDivisor > nextBearDivisor ? _cachedBearDivisor : nextBearDivisor;
        }

        (bool ok, uint256 previousPrice) = getRoundPrice(_latestRound - 1);
        // if the price just before the lastest round cannot be retrieved
        // then fallback to selecting the largest divisor from the cached divisor
        // and the divisor for the next price
        if (!ok) {
            if (isBull) {
                uint256 _cachedBullDivisor = uint256(cachedBullDivisor);
                (uint256 nextBullDivisor,) = getDivisors(_lastPrice, nextPrice);
                return _cachedBullDivisor > nextBullDivisor ? _cachedBullDivisor : nextBullDivisor;
            }

            uint256 _cachedBearDivisor = uint256(cachedBearDivisor);
            (,uint256 nextBearDivisor) = getDivisors(_lastPrice, nextPrice);
            return _cachedBearDivisor > nextBearDivisor ? _cachedBearDivisor : nextBearDivisor;
        }

        // if the price just before the latest round can be retrieved
        // then select the largest divisor from the divisor for the latest price
        // and the divisor for the price just before the latest price
        if (isBull) {
            (uint256 _previousBullDivisor,) = getDivisors(_lastPrice, previousPrice);
            (uint256 nextBullDivisor,) = getDivisors(_lastPrice, nextPrice);
            return nextBullDivisor > _previousBullDivisor ? nextBullDivisor : _previousBullDivisor;
        }

        (, uint256 _previousBearDivisor) = getDivisors(_lastPrice, previousPrice);
        (, uint256 nextBearDivisor) = getDivisors(_lastPrice, nextPrice);
        return nextBearDivisor > _previousBearDivisor ? nextBearDivisor : _previousBearDivisor;
    }

    function getPrices(uint80 r0, uint80 r1) public view returns (bool, uint256, uint256) {
        address _priceFeed = priceFeed;
        (, int256 p0, , ,) = IX2PriceFeed(_priceFeed).getRoundData(r0);
        (, int256 p1, , ,) = IX2PriceFeed(_priceFeed).getRoundData(r1);

        if (p0 <= 0 || p0 > MAX_PRICE || p1 <= 0 || p1 > MAX_PRICE) {
            return (false, 0, 0);
        }

        return (true, uint256(p0), uint256(p1));
    }

    function getRoundPrice(uint80 round) public view returns (bool, uint256) {
        address _priceFeed = priceFeed;
        (, int256 price, , ,) = IX2PriceFeed(_priceFeed).getRoundData(round);
        if (price <= 0 || price > MAX_PRICE) {
            return (false, 0);
        }

        return (true, uint256(price));
    }

    function latestPrice() public view returns (uint256) {
        int256 answer = IX2PriceFeed(priceFeed).latestAnswer();
        // avoid negative, zero or overflow values being returned
        if (answer <= 0 || answer > MAX_PRICE) {
            return uint256(lastPrice);
        }
        return uint256(answer);
    }

    function latestRound() public view returns (uint80) {
        return IX2PriceFeed(priceFeed).latestRound();
    }

    function getDivisors(uint256 _lastPrice, uint256 _nextPrice) public view returns (uint256, uint256) {
        if (_nextPrice == _lastPrice) {
            return (cachedBullDivisor, cachedBearDivisor);
        }

        uint256 bullRefSupply = IX2Token(bullToken)._totalSupply();
        uint256 bearRefSupply = IX2Token(bearToken)._totalSupply();

        // the actual underlying supplies
        uint256 totalBulls = bullRefSupply.div(cachedBullDivisor);
        uint256 totalBears = bearRefSupply.div(cachedBearDivisor);

        // scope variables to avoid stack too deep errors
        {
        // refSupply is the smaller of the two supplies
        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 delta = _nextPrice > _lastPrice ? _nextPrice.sub(_lastPrice) : _lastPrice.sub(_nextPrice);
        // profit is [(smaller supply) * (change in price) / (last price)] * multiplierBasisPoints
        uint256 profit = refSupply.mul(delta).div(_lastPrice).mul(multiplierBasisPoints).div(BASIS_POINTS_DIVISOR);

        // cap the profit to the (max profit percentage) of the smaller supply
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        if (profit > maxProfit) { profit = maxProfit; }

        totalBulls = _nextPrice > _lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
        totalBears = _nextPrice > _lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
        }

        return (_getNextDivisor(bullRefSupply, totalBulls, cachedBullDivisor), _getNextDivisor(bearRefSupply, totalBears, cachedBearDivisor));
    }

    function _getNextDivisor(uint256 _refSupply, uint256 _nextSupply, uint256 _fallbackDivisor) private pure returns (uint256) {
        if (_nextSupply == 0) {
            return INITIAL_REBASE_DIVISOR;
        }

        // round up the divisor
        uint256 divisor = _refSupply.mul(10).div(_nextSupply).add(9).div(10);
        // prevent the cachedDivisor from being set to 0
        if (divisor == 0) { return _fallbackDivisor; }

        return divisor;
    }

    function _collectFees(uint256 _amount) private returns (uint256) {
        uint256 fee = IX2ETHFactory(factory).getFee(address(this), _amount);
        if (fee == 0) { return 0; }

        feeReserve = feeReserve.add(fee);
        return fee;
    }
}
