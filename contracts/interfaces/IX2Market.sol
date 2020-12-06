// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Market {
    function getDivisor(address token) external view returns (uint256);
    function collateralToken() external view returns (address);
    function getNextUnlockTime() external view returns (uint256);
    function deposit(address account, uint256 amount) external returns (uint256);
    function withdraw(address account, address receiver, uint256 amount) external returns (uint256);
    function rebase() external returns (bool);
}
