// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/token/SafeERC20.sol";

import "./interfaces/IX2FeeReceiver.sol";

contract X2FeeReceiver is IX2FeeReceiver {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    receive() external payable {}

    function notifyETHFees(uint256 amount) public override {}
    function notifyETHInterest(uint256 amount) public override {}

    function notifyFees(address token, uint256 amount) public override {}
    function notifyInterest(address token, uint256 amount) public override {}
}
