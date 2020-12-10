// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Token {
    function _totalSupply() external view returns (uint256);
    function market() external view returns (address);
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
    function unlockTimestamps(address account) external view returns (uint256);
}
