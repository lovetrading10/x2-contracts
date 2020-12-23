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
    // max uint128 has 38 digits so it can support the INITIAL_REBASE_DIVISOR
    // increasing by 10^18 times
    uint128 public cachedBullDivisor;
    uint128 public cachedBearDivisor;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    // max uint256 has 77 digits, with an initial rebase divisor of 10^20
    // and assuming 18 decimals for tokens, collateral tokens with a supply
    // of up to 39 digits can be supported
    uint128 public constant INITIAL_REBASE_DIVISOR = 10**20;
    uint256 public constant MAX_DIVISOR = uint128(-1);

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
        cachedBullDivisor = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2ETHMarket: bearToken already set");
        bearToken = _bearToken;
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

        (uint256 bullDivisor, uint256 bearDivisor) = getDivisors(lastPrice, nextPrice);

        if (bullDivisor > MAX_DIVISOR || bearDivisor > MAX_DIVISOR) {
            return false;
        }

        cachedBullDivisor = uint128(bullDivisor);
        cachedBearDivisor = uint128(bearDivisor);

        lastPrice = nextPrice;
        lastRound = latestRound();

        return true;
    }

    function getDivisor(address _token) public view returns (uint256) {
        uint256 _lastPrice = lastPrice;
        uint80 _latestRound = latestRound();
        bool isBull = _token == bullToken;

        (bool ok, uint256 p0, uint256 p1) = getPrices(_latestRound - 1, _latestRound);
        if (!ok) {
            return isBull ? cachedBullDivisor : cachedBearDivisor;
        }

        if (isBull) {
            (uint256 bullDivisor,) = getDivisors(_lastPrice, p0 < p1 ? p0 : p1);
            return bullDivisor;
        }

        (, uint256 bearDivisor) = getDivisors(_lastPrice, p0 < p1 ? p1 : p0);
        return bearDivisor;
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

    function getDivisors(uint256 _lastPrice, uint256 _nextPrice) public view returns (uint256, uint256) {
        if (_nextPrice == _lastPrice) {
            return (cachedBullDivisor, cachedBearDivisor);
        }

        uint256 bullRefSupply = IX2Token(bullToken)._totalSupply();
        uint256 bearRefSupply = IX2Token(bearToken)._totalSupply();

        // these are the actual underlying supplies
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

        uint256 divisor = _refSupply.div(_nextSupply);
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