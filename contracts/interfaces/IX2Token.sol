// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Token {
    function _totalSupply() external view returns (uint256);
    function market() external view returns (address);
    function deposit(address receiver, uint256 amount) external returns (uint256);
    function withdraw(address account, address receiver, uint256 amount) external returns (uint256);
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
}
