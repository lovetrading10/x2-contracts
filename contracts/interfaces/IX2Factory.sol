// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Factory {
    function feeToken() external view returns (address);
    function weth() external view returns (address);
    function getFee(uint256 amount) external view returns (uint256);
    function distributeFees(address token) external;
}
