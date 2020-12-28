// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "hardhat/console.sol";

contract X2Distributor {
    using SafeMath for uint256;

    address public vault;
    address public lastReceiver;

    event Distribute(address receiver, uint256 amount);

    constructor(address _vault) public {
        vault = _vault;
    }

    function distribute(address _receiver, uint256 _amount) external returns (uint256) {
        require(msg.sender == vault, "X2Distributor: forbidden");

        uint256 halfAmount = _amount.div(2);

        if (_receiver == lastReceiver) {
            if (halfAmount == 0) { return 0; }

            (bool success,) = _receiver.call{value: halfAmount}("");
            require(success, "X2Distributor: transfer to receiver failed");

            lastReceiver = _receiver;

            emit Distribute(_receiver, halfAmount);
            return halfAmount;
        }

        uint256 totalAmount = address(this).balance.sub(halfAmount);
        if (totalAmount == 0) { return 0; }

        (bool success,) = _receiver.call{value: totalAmount}("");
        require(success, "X2Distributor: transfer to receiver failed");

        lastReceiver = _receiver;

        emit Distribute(_receiver, totalAmount);
        return totalAmount;
    }
}
