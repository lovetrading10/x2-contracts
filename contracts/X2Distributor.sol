// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "hardhat/console.sol";

contract X2Distributor {
    using SafeMath for uint256;

    address public vault;
    address public lastReceiver;

    constructor(address _vault) public {
        vault = _vault;
    }

    function distribute(address _receiver, uint256 _amount) external {
        require(msg.sender == vault, "X2Distributor: forbidden");

        uint256 halfAmount = _amount.div(2);

        if (_receiver == lastReceiver) {
            if (halfAmount == 0) { return; }

            (bool success,) = _receiver.call{value: halfAmount}("");
            require(success, "X2Distributor: transfer to receiver failed");

            lastReceiver = _receiver;
            return;
        }

        uint256 totalAmount = address(this).balance.sub(halfAmount);
        if (totalAmount == 0) { return; }

        (bool success,) = _receiver.call{value: totalAmount}("");
        require(success, "X2Distributor: transfer to receiver failed");

        lastReceiver = _receiver;
    }
}
