// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Market {
    function getDivisor(address token) external view returns (uint256);
    function collateralToken() external view returns (address);
    function getNextUnlockTime() external view returns (uint256);
    function deposit(address account, address token, uint256 amount, uint256 feeSubsidy) external returns (uint256);
    function withdraw(address account, address token, uint256 amount, address receiver) external returns (uint256);
    function rebase() external returns (bool);
}
