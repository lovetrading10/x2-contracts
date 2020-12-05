// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";

contract X2Router {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public factory;

    modifier ensureDeadline(uint _deadline) {
        require(_deadline >= block.timestamp, "X2Router: expired");
        _;
    }

    constructor(address _factory) public {
        factory = _factory;
    }

    function mint(
        address _market,
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        address collateralToken = IX2Market(_market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, _market, _amount);
        uint256 fee = IX2Factory(factory).getFee(_amount);
        uint256 mintAmount = _amount.sub(fee);
        IX2Token(_token).mint(_receiver, mintAmount);
    }

    function mintWithFeeSubsidy(
        address _market,
        address _token,
        uint256 _amount,
        uint256 _subsidy,
        address _receiver,
        uint256 _deadline
    ) external ensureDeadline(_deadline) {
        address collateralToken = IX2Market(_market).collateralToken();
        IERC20(collateralToken).safeTransferFrom(msg.sender, _market, _amount);

        address feeToken = IX2Factory(factory).feeToken();
        IERC20(feeToken).safeTransferFrom(msg.sender, _market, _subsidy);

        uint256 fee = IX2Factory(factory).getFee(_amount);
        uint256 mintAmount = _amount.sub(fee);
        IX2Token(_token).mint(_receiver, mintAmount);
    }
}
