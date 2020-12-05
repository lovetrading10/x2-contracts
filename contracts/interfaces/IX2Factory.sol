// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Factory {
    function getFee(uint256 amount) external view returns (uint256);
    function feeToken() external view returns (address);
    function distributeFees(address token) external;
}
