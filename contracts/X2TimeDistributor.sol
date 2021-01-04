// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/math/SafeMath.sol";

contract X2TimeDistributor {
    using SafeMath for uint256;

    uint256 public constant DISTRIBUTION_INTERVAL = 1 hours;

    address public gov;

    mapping (address => uint256) public ethPerInterval;
    mapping (address => uint256) public lastDistributionTime;

    event Distribute(address receiver, uint256 amount);
    event DistributionChange(address receiver, uint256 amount);

    constructor() public {
        gov = msg.sender;
    }

    receive() external payable {}

    function setDistribution(address[] calldata _receivers, uint256[] calldata _amounts) external {
        require(msg.sender == gov, "X2TimeDistributor: forbidden");

        for (uint256 i = 0; i < _receivers.length; i++) {
            address receiver = _receivers[i];

            if (lastDistributionTime[receiver] != 0) {
                uint256 currentTime = block.timestamp;
                uint256 timeDiff = currentTime.sub(lastDistributionTime[receiver]);
                uint256 intervals = timeDiff.div(DISTRIBUTION_INTERVAL);
                require(intervals == 0, "X2TimeDistributor: pending distribution");
            }

            uint256 amount = _amounts[i];
            ethPerInterval[receiver] = amount;
            lastDistributionTime[receiver] = block.timestamp;
            emit DistributionChange(receiver, amount);
        }
    }

    function distribute() external returns (uint256) {
        uint256 _ethPerInterval = ethPerInterval[msg.sender];
        if (_ethPerInterval == 0) { return 0; }

        uint256 currentTime = block.timestamp;
        uint256 timeDiff = currentTime.sub(lastDistributionTime[msg.sender]);
        uint256 intervals = timeDiff.div(DISTRIBUTION_INTERVAL);
        uint256 amount = _ethPerInterval.mul(intervals);

        lastDistributionTime[msg.sender] = currentTime;

        if (address(this).balance < amount) { return 0; }

        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "X2TimeDistributor: transfer failed");

        emit Distribute(msg.sender, amount);
        return amount;
    }
}
