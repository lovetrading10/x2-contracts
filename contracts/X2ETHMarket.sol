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

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    // max uint256 has 77 digits, with an initial rebase divisor of 10^20
    // and assuming 18 decimals for tokens, collateral tokens with a supply
    // of up to 39 digits can be supported
    uint256 public constant INITIAL_REBASE_DIVISOR = 10**20;

    address public factory;

    address public weth;
    address public bullToken;
    address public bearToken;
    address public priceFeed;
    uint256 public multiplierBasisPoints;
    uint256 public maxProfitBasisPoints;
    uint256 public minDeltaBasisPoints;
    uint256 public lastPrice;

    uint256 public feeReserve;

    bool public isInitialized;

    mapping (address => uint256) public cachedDivisors;

    modifier onlyFactory() {
        require(msg.sender == factory, "X2ETHMarket: forbidden");
        _;
    }

    function initialize(
        address _factory,
        address _priceFeed,
        uint256 _multiplierBasisPoints,
        uint256 _maxProfitBasisPoints,
        uint256 _minDeltaBasisPoints
    ) public {
        require(!isInitialized, "X2ETHMarket: already initialized");
        isInitialized = true;

        factory = _factory;
        priceFeed = _priceFeed;
        multiplierBasisPoints = _multiplierBasisPoints;
        maxProfitBasisPoints = _maxProfitBasisPoints;
        minDeltaBasisPoints = _minDeltaBasisPoints;

        lastPrice = latestPrice();
        require(lastPrice != 0, "X2ETHMarket: unsupported price feed");
    }

    function setBullToken(address _bullToken) public onlyFactory {
        require(bullToken == address(0), "X2ETHMarket: bullToken already set");
        bullToken = _bullToken;
        cachedDivisors[bullToken] = INITIAL_REBASE_DIVISOR;
    }

    function setBearToken(address _bearToken) public onlyFactory {
        require(bearToken == address(0), "X2ETHMarket: bearToken already set");
        bearToken = _bearToken;
        cachedDivisors[bearToken] = INITIAL_REBASE_DIVISOR;
    }

    function deposit(address _token, address _receiver) public payable nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2ETHMarket: unsupported token");
        uint256 amount = msg.value;
        require(amount > 0, "X2ETHMarket: insufficient collateral sent");

        rebase();

        uint256 fee = _collectFees(amount);
        uint256 depositAmount = amount.sub(fee);
        IX2Token(_token).mint(_receiver, depositAmount, cachedDivisors[_token]);

        return depositAmount;
    }

    function withdraw(address _token, uint256 _amount, address _receiver) public nonReentrant returns (uint256) {
        require(_token == bullToken || _token == bearToken, "X2ETHMarket: unsupported token");
        rebase();

        IX2Token(_token).burn(msg.sender, _amount);

        uint256 fee = _collectFees(_amount);
        uint256 withdrawAmount = _amount.sub(fee);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2ETHMarket: eth transfer failed");

        return withdrawAmount;
    }

    function rebase() public pure {}

    function latestPrice() public view returns (uint256) {
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


    function _collectFees(uint256 _amount) private returns (uint256) {
        uint256 fee = IX2Factory(factory).getFee(address(this), _amount);
        if (fee == 0) { return 0; }

        feeReserve = feeReserve.add(fee);
        return fee;
    }
}
