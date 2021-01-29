// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../interfaces/IX2PriceFeed.sol";

contract MockPriceFeed is IX2PriceFeed {
    int256 public answer;
    uint80 public roundId;
    string public description = "MockPriceFeed";
    address public override aggregator;

    mapping (uint80 => int256) answers;

    function latestAnswer() public override view returns (int256) {
        return answer;
    }

    function latestRound() public override view returns (uint80) {
        return roundId;
    }

    function setLatestAnswer(int256 _answer) public {
        roundId = roundId + 1;
        answer = _answer;
        answers[roundId] = _answer;
    }

    // returns roundId, answer, startedAt, updatedAt, answeredInRound
    function getRoundData(uint80 _roundId) public override view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, answers[_roundId], 0, 0, 0);
    }
}
