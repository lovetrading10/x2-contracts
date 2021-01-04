// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Market {
    function getDivisor(address token) external view returns (uint256);
}
