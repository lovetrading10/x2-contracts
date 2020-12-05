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

contract X2Router is IX2Router {
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
        address _market,
        address _token,
        uint256 _amount,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        address collateralToken = IX2Market(_market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, _market, _amount);
        _deposit(_token, _amount);
    }

    function depositETH(
        address _market,
        address _token,
        uint256 _amount,
        uint256 _deadline
    ) external payable ensureDeadline(_deadline) {
        IWETH(weth).deposit{value: _amount}();
        require(IWETH(weth).transfer(_market, _amount), "X2Router: weth transfer failed");
        _deposit(_token, _amount);
    }

    function depositSupportingFeeSubsidy(
        address _market,
        address _token,
        uint256 _amount,
        uint256 _subsidy,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        address collateralToken = IX2Market(_market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, _market, _amount);
        address feeToken = IX2Factory(factory).feeToken();
        IERC20(feeToken).safeTransferFrom(msg.sender, _market, _subsidy);
        _deposit(_token, _amount);
    }

    function depositETHSupportingFeeSubsidy(
        address _market,
        address _token,
        uint256 _amount,
        uint256 _subsidy,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        IWETH(weth).deposit{value: _amount}();
        require(IWETH(weth).transfer(_market, _amount), "X2Router: weth transfer failed");
        address feeToken = IX2Factory(factory).feeToken();
        IERC20(feeToken).safeTransferFrom(msg.sender, _market, _subsidy);
        _deposit(_token, _amount);
    }

    function withdraw(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        _withdraw(_token, _amount, _receiver);
    }

    function withdrawETH(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        uint256 withdrawAmount = _withdraw(_token, _amount, address(this));
        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2Token: eth transfer failed");
    }

    function _deposit(address _token, uint256 _amount) private {
        uint256 fee = IX2Factory(factory).getFee(_amount);
        uint256 depositAmount = _amount.sub(fee);
        IX2Token(_token).deposit(msg.sender, depositAmount);
    }

    function _withdraw(address _token, uint256 _amount, address _receiver) private returns (uint256) {
        return IX2Token(_token).withdraw(msg.sender, _receiver, _amount);
    }
}
