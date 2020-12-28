// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../interfaces/IX2PriceFeed.sol";

contract MockDistributor {
    receive() external payable {}

    function distribute() external returns (uint256) {
        uint256 balance = address(this).balance;
        address receiver = msg.sender;
        (bool success,) = receiver.call{value: balance}("");
        require(success, "MockDistributor: transfer to receiver failed");
        return balance;
    }
}
