// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Market {
    function bullToken() external view returns (address);
    function bearToken() external view returns (address);
    function latestPrice() external view returns (uint256);
    function getDivisor(address token) external view returns (uint256);
    function collateralToken() external view returns (address);
    function getNextUnlockTime() external view returns (uint256);
    function deposit(address token, uint256 amount, uint256 feeSubsidy, address receiver) external returns (uint256);
    function withdraw(address token, uint256 amount, address receiver) external returns (uint256);
    function rebase() external returns (bool);
}
