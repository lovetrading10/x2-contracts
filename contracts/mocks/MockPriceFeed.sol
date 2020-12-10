// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../interfaces/IX2PriceFeed.sol";

contract MockPriceFeed is IX2PriceFeed {
    uint256 answer;

    function latestAnswer() public override view returns (uint256) {
        return answer;
    }

    function latestTimestamp() public override view returns (uint256) {
        return block.timestamp;
    }

    function setLatestAnswer(uint256 _answer) public {
        answer = _answer;
    }
}
