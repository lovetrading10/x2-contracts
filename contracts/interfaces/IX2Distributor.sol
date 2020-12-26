// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IX2Distributor {
    function distribute(address receiver) external returns (bool);
}
