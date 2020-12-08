// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IWETH.sol";
import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Router.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";
import "hardhat/console.sol";

contract X2Router is IX2Router, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public factory;
    address public override weth;

    modifier ensureDeadline(uint _deadline) {
        require(_deadline >= block.timestamp, "X2Router: expired");
        _;
    }

    constructor(address _factory, address _weth) public {
        factory = _factory;
        weth = _weth;
    }

    receive() external payable {
        require(msg.sender == weth, "X2Token: unsupported sender");
    }

    function deposit(
        address _token,
        uint256 _amount,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        _transferCollateralToMarket(market, _amount);
        _deposit(market, _token, _amount, 0);
    }

    function depositETH(
        address _token,
        uint256 _deadline
    ) external payable nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        _transferETHToMarket(market, msg.value);
        _deposit(market, _token, msg.value, 0);
    }

    function depositSupportingFeeSubsidy(
        address _token,
        uint256 _amount,
        uint256 _subsidy,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        _transferCollateralToMarket(market, _amount);
        _collectFeeToken(market, _subsidy);
        _deposit(market, _token, _amount, _subsidy);
    }

    function depositETHSupportingFeeSubsidy(
        address _token,
        uint256 _subsidy,
        uint256 _deadline
    ) external payable nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        _transferETHToMarket(market, msg.value);
        _collectFeeToken(market, _subsidy);
        _deposit(market, _token, msg.value, _subsidy);
    }

    function withdraw(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        _withdraw(market, _token, _amount, _receiver);
    }

    function withdrawETH(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        require(IX2Market(market).collateralToken() == weth, "X2Router: mismatched collateral");

        uint256 withdrawAmount = _withdraw(market, _token, _amount, address(this));
        IWETH(weth).withdraw(withdrawAmount);

        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2Token: eth transfer failed");
    }

    function withdrawAll(
        address _token,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        uint256 amount = IERC20(_token).balanceOf(msg.sender);
        _withdraw(market, _token, amount, _receiver);
    }

    function withdrawAllETH(
        address _token,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = _getMarket(_token);
        uint256 amount = IERC20(_token).balanceOf(msg.sender);
        require(IX2Market(market).collateralToken() == weth, "X2Router: mismatched collateral");

        uint256 withdrawAmount = _withdraw(market, _token, amount, address(this));
        IWETH(weth).withdraw(withdrawAmount);

        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2Token: eth transfer failed");
    }


    function _transferETHToMarket(address _market, uint256 _amount) private {
        require(IX2Market(_market).collateralToken() == weth, "X2Router: mismatched collateral");
        IWETH(weth).deposit{value: _amount}();
        require(IWETH(weth).transfer(_market, _amount), "X2Router: weth transfer failed");
    }

    function _transferCollateralToMarket(address _market, uint256 _amount) private {
        address collateralToken = IX2Market(_market).collateralToken();
        uint256 balance = IERC20(collateralToken).balanceOf(_market);
        IERC20(collateralToken).safeTransferFrom(msg.sender, _market, _amount);
        require(IERC20(collateralToken).balanceOf(_market).sub(balance) == _amount, "X2Router: token transfer failed");
    }

    function _getMarket(address _token) private view returns (address) {
        address market = IX2Token(_token).market();
        require(IX2Factory(factory).isMarket(market), "X2Router: unsupported market");
        return market;
    }

    function _collectFeeToken(address _market, uint256 _subsidy) private {
        address feeToken = IX2Factory(factory).feeToken();
        IERC20(feeToken).safeTransferFrom(msg.sender, _market, _subsidy);
    }

    function _deposit(address _market, address _token, uint256 _amount, uint256 _feeSubsidy) private returns (uint256) {
        return IX2Market(_market).deposit(msg.sender, _token, _amount, _feeSubsidy);
    }

    function _withdraw(address _market, address _token, uint256 _amount, address _receiver) private returns (uint256) {
        return IX2Market(_market).withdraw(msg.sender, _token, _amount, _receiver);
    }
}
