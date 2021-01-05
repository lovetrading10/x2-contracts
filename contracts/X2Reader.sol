// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";
import "./interfaces/IX2TimeDistributor.sol";
import "./libraries/token/IERC20.sol";

contract X2Reader {
    using SafeMath for uint256;

    function getMarketInfo(address _market) public view returns (uint256[] memory) {
        address bullToken = IX2Market(_market).bullToken();
        address bearToken = IX2Market(_market).bearToken();

        uint256[] memory amounts = new uint256[](3);

        amounts[0] = IX2Market(_market).latestPrice();
        amounts[1] = IERC20(bullToken).totalSupply();
        amounts[2] = IERC20(bearToken).totalSupply();

        return amounts;
    }

    function getRewards(address _token, address _account) public view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](2);
        address distributor = IX2Token(_token).distributor();
        if (distributor == address(0)) {
            return amounts;
        }

        uint256 rewards = IX2Token(_token).getReward(_account);
        uint256 pendingRewards = IX2TimeDistributor(distributor).getDistributionAmount(_token);
        uint256 balance = IX2Token(_token)._balanceOf(_account);
        uint256 supply = IX2Token(_token)._totalSupply();
        amounts[0] = rewards.add(pendingRewards.mul(balance).div(supply));
        amounts[1] = IX2TimeDistributor(distributor).ethPerInterval(_token);
        return amounts;
    }

    function getBalanceInfo(address _market, address _account) public view returns (uint256[] memory) {
        address bullToken = IX2Market(_market).bullToken();
        address bearToken = IX2Market(_market).bearToken();
        uint256 nextPrice = IX2Market(_market).latestPrice();
        uint256 lastPrice = uint256(IX2Market(_market).lastPrice());
        (uint256 bullDivisor, uint256 bearDivisor) = IX2Market(_market).getDivisors(lastPrice, nextPrice);

        uint256[] memory amounts = new uint256[](9);

        amounts[0] = _account.balance;
        amounts[1] = IERC20(bullToken).balanceOf(_account);
        amounts[2] = IERC20(bearToken).balanceOf(_account);
        amounts[3] = bullDivisor;
        amounts[4] = bearDivisor;
        amounts[5] = uint256(IX2Token(bullToken).getDivisor());
        amounts[6] = uint256(IX2Token(bearToken).getDivisor());
        amounts[7] = IX2Token(bullToken).costOf(_account);
        amounts[8] = IX2Token(bearToken).costOf(_account);

        return amounts;
    }
}
