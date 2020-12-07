// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/token/SafeERC20.sol";

import "./interfaces/IX2Factory.sol";
import "./X2Market.sol";
import "./X2Token.sol";

contract X2Factory is IX2Factory {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BASIS_POINTS = 20;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gov;
    address public override feeReceiver;
    address public override feeToken;
    address public router;

    address[] public markets;

    bool public freeMarketCreation = false;

    modifier onlyGov() {
        require(msg.sender == gov, "X2Factory: forbidden");
        _;
    }

    constructor(address _feeToken) public {
        feeToken = _feeToken;
        gov = msg.sender;
    }

    function setRouter(address _router) external onlyGov {
        require(router == address(0), "X2Factory: router already set");
        router = _router;
    }

    function marketsLength() external view returns (uint256) {
        return markets.length;
    }

    function enableFreeMarketCreation() external onlyGov {
        freeMarketCreation = true;
    }

    function createMarket(
        string memory _bullTokenSymbol,
        string memory _bearTokenSymbol,
        address _collateralToken,
        address _priceFeed,
        uint256 _multiplier,
        uint256 _unlockDelay,
        uint256 _maxProfitBasisPoints
    ) external returns (address, address, address) {
        if (!freeMarketCreation) {
            require(msg.sender == gov, "X2Factory: forbidden");
        }

        X2Market market = new X2Market(
            address(this),
            router,
            _collateralToken,
            _priceFeed,
            _multiplier,
            _unlockDelay,
            _maxProfitBasisPoints
        );

        X2Token bullToken = new X2Token(address(market), router, _bullTokenSymbol);
        X2Token bearToken = new X2Token(address(market), router, _bearTokenSymbol);

        market.setBullToken(address(bullToken));
        market.setBearToken(address(bearToken));

        markets.push(address(market));

        return (address(market), address(bullToken), address(bearToken));
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
    }

    function setFeeReceiver(address _feeReceiver) external onlyGov {
        feeReceiver = _feeReceiver;
    }

    function getFee(uint256 _amount) external override view returns (uint256) {
        if (feeReceiver == address(0)) {
            return 0;
        }
        return _amount.mul(FEE_BASIS_POINTS).div(BASIS_POINTS_DIVISOR);
    }
}
