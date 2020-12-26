// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/token/SafeERC20.sol";

import "./interfaces/IX2ETHFactory.sol";
import "./interfaces/IX2Distributor.sol";

import "./X2ETHMarket.sol";
import "./X2Token.sol";

contract X2ETHFactory is IX2ETHFactory {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_FEE_BASIS_POINTS = 40; // max 0.4% fee
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gov;
    address public distributor;
    address public override feeReceiver;
    address public weth;

    address[] public markets;
    bool public freeMarketCreation = false;

    mapping (address => uint256) public feeBasisPoints;

    event CreateMarket(
        string bullToken,
        string bearToken,
        address collateralToken,
        address priceFeed,
        uint256 multiplierBasisPoints,
        uint256 maxProfitBasisPoints,
        uint256 index
    );

    event GovChange(address gov);
    event FeeChange(address market, uint256 fee);
    event FeeReceiverChange(address feeReceiver);

    modifier onlyGov() {
        require(msg.sender == gov, "X2Factory: forbidden");
        _;
    }

    constructor(address _weth) public {
        weth = _weth;
        gov = msg.sender;
    }

    function marketsLength() external view returns (uint256) {
        return markets.length;
    }

    function enableFreeMarketCreation() external onlyGov {
        freeMarketCreation = true;
    }

    function setDistributor(address _token, address _distributor) external onlyGov {
        X2Token(_token).setDistributor(_distributor);
    }

    function createETHMarket(
        string memory _bullTokenSymbol,
        string memory _bearTokenSymbol,
        address _priceFeed,
        uint256 _multiplierBasisPoints,
        uint256 _maxProfitBasisPoints
    ) external returns (address, address, address) {
        if (!freeMarketCreation) {
            require(msg.sender == gov, "X2Factory: forbidden");
        }

        X2ETHMarket market = new X2ETHMarket();
        market.initialize(
            address(this),
            _priceFeed,
            _multiplierBasisPoints,
            _maxProfitBasisPoints
        );

        X2Token bullToken = new X2Token();
        bullToken.initialize(address(this), address(market), _bullTokenSymbol);

        X2Token bearToken = new X2Token();
        bearToken.initialize(address(this), address(market), _bearTokenSymbol);

        market.setBullToken(address(bullToken));
        market.setBearToken(address(bearToken));

        markets.push(address(market));

        emit CreateMarket(
            _bullTokenSymbol,
            _bearTokenSymbol,
            address(0),
            _priceFeed,
            _multiplierBasisPoints,
            _maxProfitBasisPoints,
            markets.length - 1
        );

        return (address(market), address(bullToken), address(bearToken));
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
        emit GovChange(gov);
    }

    function setFee(address _market, uint256 _feeBasisPoints) external onlyGov {
        require(_feeBasisPoints <= MAX_FEE_BASIS_POINTS, "X2Factory: fee exceeds allowed limit");
        feeBasisPoints[_market] = _feeBasisPoints;
        emit FeeChange(_market, _feeBasisPoints);
    }

    function setFeeReceiver(address _feeReceiver) external onlyGov {
        feeReceiver = _feeReceiver;
        emit FeeReceiverChange(feeReceiver);
    }

    function getFee(address _market, uint256 _amount) external override view returns (uint256) {
        if (feeReceiver == address(0)) {
            return 0;
        }
        return _amount.mul(feeBasisPoints[_market]).div(BASIS_POINTS_DIVISOR);
    }
}
