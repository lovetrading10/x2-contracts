// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

contract MockFeeReceiver {
    address public gov;

    constructor() public {
        gov = msg.sender;
    }

    receive() external payable {}

    function notifyInterest(address /* _token */, uint256 /* _interest */) external {
        uint256 amount = address(this).balance;
        require(amount > 0, "MockFeeReceiver: zero balance");
        (bool success,) = gov.call{value: amount}("");
        require(success, "MockFeeReceiver: transfer failed");
    }

    function distribute(address /* _receiver */, uint256 /* _amount */) external returns (uint256) {
        uint256 amount = address(this).balance;
        require(amount > 0, "MockFeeReceiver: zero balance");
        (bool success,) = gov.call{value: amount}("");
        require(success, "MockFeeReceiver: transfer failed");
        return amount;
    }
}
