// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";
import "hardhat/console.sol";

contract X2Distributor {
    using SafeMath for uint256;

    address public bullToken;
    address public bearToken;
    address public vault;

    uint256 public bullBalance;
    uint256 public bearBalance;

    constructor(address _bullToken, address _bearToken, address _vault) public {
        bullToken = _bullToken;
        bearToken = _bearToken;
        vault = _vault;
    }

    function distribute(address _receiver, uint256 _amount) external {
        require(msg.sender == vault, "X2Distributor: forbidden");

        address _bullToken = bullToken;
        address _bearToken = bearToken;
        require(_receiver == bullToken || _receiver == _bearToken, "X2Distributor: unsupported receiver");

        uint256 halfAmount = _amount.div(2);

        if (_receiver == _bullToken) {
            uint256 totalAmount = halfAmount.add(bullBalance);
            if (totalAmount == 0) { return; }

            (bool success,) = _receiver.call{value: totalAmount}("");
            require(success, "X2Distributor: transfer to receiver failed");
            bullBalance = 0;
            bearBalance = bearBalance.add(halfAmount);
        } else {
            uint256 totalAmount = halfAmount.add(bearBalance);
            if (totalAmount == 0) { return; }

            (bool success,) = _receiver.call{value: totalAmount}("");
            require(success, "X2Distributor: transfer to receiver failed");
            bearBalance = 0;
            bullBalance = bullBalance.add(halfAmount);
        }
    }
}
