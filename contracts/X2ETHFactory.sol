// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";

import "./interfaces/IX2ETHFactory.sol";
import "./interfaces/IX2Token.sol";

import "./X2ETHMarket.sol";
import "./X2Token.sol";

contract X2ETHFactory is IX2ETHFactory {
    using SafeMath for uint256;

    uint256 public constant MAX_FEE_BASIS_POINTS = 40; // max 0.4% fee
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gov;
    address public appOwner;
    address public distributor;
    address public override feeReceiver;
    address public override interestReceiver;

    address[] public markets;

    event CreateMarket(
        address priceFeed,
        uint256 multiplierBasisPoints,
        uint256 maxProfitBasisPoints,
        uint256 index
    );

    event GovChange(address gov);
    event AppOwnerChange(address appOwner);
    event FeeReceiverChange(address feeReceiver);
    event AppFeeChange(address market, uint256 feeBasisPoints, address feeReceiver);
    event InterestReceiverChange(address feeReceiver);
    event DistributorChange(address token, address distributor, address rewardToken);
    event InfoChange(address token, string name, string symbol);
    event FundingChange(address market, uint256 fundingDivisor);

    modifier onlyGov() {
        require(msg.sender == gov, "X2ETHFactory: forbidden");
        _;
    }

    modifier onlyAppOwner() {
        require(msg.sender == appOwner, "X2ETHFactory: forbidden");
        _;
    }

    constructor() public {
        gov = msg.sender;
    }

    function marketsLength() external view returns (uint256) {
        return markets.length;
    }

    function setDistributor(address _token, address _distributor, address _rewardToken) external onlyGov {
        IX2Token(_token).setDistributor(_distributor, _rewardToken);
        emit DistributorChange(_token, _distributor, _rewardToken);
    }

    function setFunding(address _market, uint256 _fundingDivisor) external onlyGov {
        IX2Market(_market).setFunding(_fundingDivisor);
        emit FundingChange(_market, _fundingDivisor);
    }

    function setAppFee(address _market, uint256 _appFeeBasisPoints, address _appFeeReceiver) external onlyAppOwner {
        IX2Market(_market).setAppFee(_appFeeBasisPoints, _appFeeReceiver);
        emit AppFeeChange(_market, _appFeeBasisPoints, _appFeeReceiver);
    }

    function setInfo(
        address _bullToken,
        string calldata _bullName,
        string calldata _bullSymbol,
        address _bearToken,
        string calldata _bearName,
        string calldata _bearSymbol
    ) external onlyGov {
        IX2Token(_bullToken).setInfo(_bullName, _bullSymbol);
        IX2Token(_bearToken).setInfo(_bearName, _bearSymbol);
        emit InfoChange(_bullToken, _bullName, _bullSymbol);
        emit InfoChange(_bearToken, _bearName, _bearSymbol);
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
        emit GovChange(gov);
    }

    function setAppOwner(address _appOwner) external onlyGov {
        appOwner = _appOwner;
        emit AppOwnerChange(appOwner);
    }

    function setFeeReceiver(address _feeReceiver) external onlyGov {
        feeReceiver = _feeReceiver;
        emit FeeReceiverChange(feeReceiver);
    }

    function setInterestReceiver(address _interestReceiver) external onlyGov {
        interestReceiver = _interestReceiver;
        emit InterestReceiverChange(interestReceiver);
    }

    function createMarket(
        address _priceFeed,
        uint256 _multiplierBasisPoints,
        uint256 _maxProfitBasisPoints,
        uint256 _fundingDivisor,
        uint256 _appFeeBasisPoints,
        address _appFeeReceiver
    ) external returns (address, address, address) {
        require(msg.sender == gov || msg.sender == appOwner, "X2ETHFactory: forbidden");

        X2ETHMarket market = new X2ETHMarket();
        market.initialize(
            address(this),
            _priceFeed,
            _multiplierBasisPoints,
            _maxProfitBasisPoints,
            _fundingDivisor,
            _appFeeBasisPoints,
            _appFeeReceiver
        );

        X2Token bullToken = new X2Token();
        bullToken.initialize(address(this), address(market));

        X2Token bearToken = new X2Token();
        bearToken.initialize(address(this), address(market));

        market.setBullToken(address(bullToken));
        market.setBearToken(address(bearToken));

        markets.push(address(market));

        emit CreateMarket(
            _priceFeed,
            _multiplierBasisPoints,
            _maxProfitBasisPoints,
            markets.length - 1
        );

        return (address(market), address(bullToken), address(bearToken));
    }
}
