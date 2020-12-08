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
    // max uint256 has 77 digits, with an initial rebase divisor of 10^20
    // and assuming 18 decimals for regular tokens, collateral tokens with a supply
    // of up to 39 digits can be supported
    uint256 public constant INITIAL_REBASE_DIVISOR = 10**20;

    address public factory;
    address public router;

    address public override collateralToken;
    address public bullToken;
    address public bearToken;
    address public priceFeed;
    uint256 public multiplier;
    uint256 public unlockDelay;
    uint256 public maxProfitBasisPoints;
    uint256 public lastPrice;

    uint256 public feeReserve;

    mapping (address => uint256) public cachedDivisors;

    event Fee(uint256 fee, uint256 subsidy);
    event PriceChange(uint256 price);
    event DistributeFees(uint256 fees);

    modifier onlyRouter() {
        require(msg.sender == router, "X2Market: forbidden");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "X2Market: forbidden");
        _;
    }

    constructor(
        address _factory,
        address _router,
        address _collateralToken,
        address _priceFeed,
        uint256 _multiplier,
        uint256 _unlockDelay,
        uint256 _maxProfitBasisPoints
    ) public {
        factory = _factory;
        router = _router;
        collateralToken = _collateralToken;
        priceFeed = _priceFeed;
        multiplier = _multiplier;
        unlockDelay = _unlockDelay;
        maxProfitBasisPoints = _maxProfitBasisPoints;

        lastPrice = latestPrice();
        require(lastPrice != 0, "X2Market: unsupported price feed");
    }

    function setBullToken(address _bullToken) public onlyFactory {
        require(bullToken == address(0), "X2Market: bullToken already set");
        bullToken = _bullToken;
        cachedDivisors[bullToken] = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2Market: bearToken already set");
        bearToken = _bearToken;
        cachedDivisors[bearToken] = INITIAL_REBASE_DIVISOR;
    }

    function deposit(address _account, address _token, uint256 _amount, uint256 _feeSubsidy) public override onlyRouter returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");
        rebase();

        uint256 fee = _collectFees(_amount, _feeSubsidy);
        uint256 depositAmount = _amount.sub(fee);
        IX2Token(_token).mint(_account, depositAmount);

        return depositAmount;
    }

    function withdraw(address _account, address _token, uint256 _amount, address _receiver) public override onlyRouter returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");
        rebase();

        IX2Token(_token).burn(_account, _amount);

        uint256 fee = _collectFees(_amount, 0);
        uint256 withdrawAmount = _amount.sub(fee);
        IERC20(collateralToken).safeTransfer(_receiver, withdrawAmount);

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
        // store the divisor values as updating cachedDivisors will change the
        // value returned from getDivisor
        uint256 bullDivisor = getDivisor(bullToken);
        uint256 bearDivisor = getDivisor(bearToken);
        cachedDivisors[bullToken] = bullDivisor;
        cachedDivisors[bearToken] = bearDivisor;
        uint256 nextPrice = latestPrice();
        lastPrice = nextPrice;
        emit PriceChange(nextPrice);
    }

    function latestPrice() public view returns (uint256) {
        uint256 answer = IX2PriceFeed(priceFeed).latestAnswer();
        // prevent zero from being returned
        if (answer == 0) { return lastPrice; }
        return answer;
    }

    function getDivisor(address _token) public override view returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2Market: unsupported token");

        uint256 totalBulls = cachedTotalSupply(bullToken);
        uint256 totalBears = cachedTotalSupply(bearToken);

        uint256 nextPrice = latestPrice();

        if (nextPrice == lastPrice) {
            return cachedDivisors[_token];
        }

        // refSupply is the smaller of the two supplies
        uint256 refSupply = totalBulls < totalBears ? totalBulls : totalBears;
        uint256 delta = nextPrice > lastPrice ? nextPrice.sub(lastPrice) : lastPrice.sub(nextPrice);
        // profit is [(smaller supply) * (change in price) / (last price)] * multiplier
        uint256 profit = refSupply.mul(delta).div(lastPrice).mul(multiplier);

        // cap the profit to the (max profit percentage) of the smaller supply
        uint256 maxProfit = refSupply.mul(maxProfitBasisPoints).div(BASIS_POINTS_DIVISOR);
        if (profit > maxProfit) { profit = maxProfit; }

        if (_token == bullToken) {
            uint256 nextSupply = nextPrice > lastPrice ? totalBulls.add(profit) : totalBulls.sub(profit);
            return _getNextDivisor(_token, nextSupply);
        }

        uint256 nextSupply = nextPrice > lastPrice ? totalBears.sub(profit) : totalBears.add(profit);
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
}
