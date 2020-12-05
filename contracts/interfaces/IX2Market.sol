// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Market {
    function divisors(address token) external view returns (uint256);
    function collateralToken() external view returns (address);
    function getNextUnlockTimestamp() external view returns (uint256);
    function deposit(uint256 amount) external returns (bool);
    function withdraw(address receiver, uint256 amount) external returns (uint256);
}
