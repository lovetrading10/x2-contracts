// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./libraries/token/SafeERC20.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2FeeReceiver.sol";

contract X2Factory is IX2Factory {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BASIS_POINTS = 20;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gov;
    address public feeReceiver;
    address public override feeToken;
    address public override weth;

    modifier onlyGov() {
        require(msg.sender == gov, "X2Market: forbidden");
        _;
    }

    constructor(address _weth, address _feeToken) public {
        weth = _weth;
        feeToken = _feeToken;
        gov = msg.sender;
    }

    function setGov(address _gov) public onlyGov {
        gov = _gov;
    }

    function setFeeReceiver(address _feeReceiver) public onlyGov {
        feeReceiver = _feeReceiver;
    }

    function getFee(uint256 _amount) public override view returns (uint256) {
        if (feeReceiver == address(0)) {
            return 0;
        }
        return _amount.mul(FEE_BASIS_POINTS).div(BASIS_POINTS_DIVISOR);
    }

    function distributeFees(address token) public override {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(feeReceiver, balance);
        IX2FeeReceiver(feeReceiver).notifyFees(token, balance);
    }
}
