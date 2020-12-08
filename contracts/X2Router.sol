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
        address market = IX2Token(_token).market();
        address collateralToken = IX2Market(market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, market, _amount);
        _deposit(market, _token, _amount, 0);
    }

    function depositETH(
        address _token,
        uint256 _deadline
    ) external payable nonReentrant ensureDeadline(_deadline) {
        address market = IX2Token(_token).market();
        uint256 amount = msg.value;
        IWETH(weth).deposit{value: amount}();
        require(IWETH(weth).transfer(market, amount), "X2Router: weth transfer failed");
        _deposit(market, _token, amount, 0);
    }

    function depositSupportingFeeSubsidy(
        address _token,
        uint256 _amount,
        uint256 _subsidy,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = IX2Token(_token).market();
        address collateralToken = IX2Market(market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, market, _amount);
        _collectFeeToken(market, _subsidy);
        _deposit(market, _token, _amount, _subsidy);
    }

    function depositETHSupportingFeeSubsidy(
        address _token,
        uint256 _subsidy,
        uint256 _deadline
    ) external payable nonReentrant ensureDeadline(_deadline) {
        address market = IX2Token(_token).market();
        uint256 amount = msg.value;
        IWETH(weth).deposit{value: amount}();
        require(IWETH(weth).transfer(market, amount), "X2Router: weth transfer failed");
        _collectFeeToken(market, _subsidy);
        _deposit(market, _token, amount, _subsidy);
    }

    function withdraw(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = IX2Token(_token).market();
        _withdraw(market, _token, _amount, _receiver);
    }

    function withdrawETH(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external nonReentrant ensureDeadline(_deadline) {
        address market = IX2Token(_token).market();
        uint256 withdrawAmount = _withdraw(market, _token, _amount, address(this));
        IWETH(weth).withdraw(withdrawAmount);
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2Token: eth transfer failed");
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
