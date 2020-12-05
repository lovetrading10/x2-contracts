// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Token {
    function deposit(address receiver, uint256 amount) external returns (bool);
}
