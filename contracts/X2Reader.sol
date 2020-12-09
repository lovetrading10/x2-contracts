// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./interfaces/IX2Market.sol";
import "./libraries/token/IERC20.sol";

contract X2Reader {
    using SafeMath for uint256;

    function getMarketInfo(address _market, address _account) public view returns (uint256, uint256, uint256, uint256, uint256) {
        address bullToken = IX2Market(_market).bullToken();
        address bearToken = IX2Market(_market).bearToken();

        return (
            IERC20(bullToken).totalSupply(),
            IERC20(bearToken).totalSupply(),
            IERC20(bullToken).balanceOf(_account),
            IERC20(bearToken).balanceOf(_account),
            IX2Market(_market).latestPrice()
        );
    }
}
