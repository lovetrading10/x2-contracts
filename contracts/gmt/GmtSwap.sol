//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../interfaces/IXVIX.sol";
import "../interfaces/IBurnVault.sol";
import "../interfaces/IGmtIou.sol";

contract GmtSwap is ReentrancyGuard {
    using SafeMath for uint256;

    address public xvix;
    address public uni;
    address public xlge;
    address public gmtIou;
    address public allocator;
    address public burnVault;
    uint256 public unlockTime;
    address public gov;

    constructor(
        address _xvix,
        address _uni,
        address _xlge,
        address _gmtIou,
        address _allocator,
        uint256 _unlockTime,
        address _burnVault
    ) public {
        xvix = _xvix;
        uni = _uni;
        xlge = _xlge;
        gmtIou = _gmtIou;
        allocator = _allocator;
        burnVault = _burnVault;
        unlockTime = _unlockTime;
        gov = msg.sender;
    }

    modifier onlyGov() {
        require(msg.sender == gov, "GmtSwap: forbidden");
        _;
    }

    function setGov(address _gov) public onlyGov {
        gov = _gov;
    }

    function extendUnlockTime(uint256 _unlockTime) public onlyGov {
        require(_unlockTime > unlockTime, "GmtSwap: invalid unlockTime");
        unlockTime = _unlockTime;
    }

    function withdraw(address _token, uint256 _tokenAmount, address _receiver) public onlyGov {
        require(block.timestamp > unlockTime, "GmtSwap: unlockTime not yet passed");
        IERC20(_token).transfer(_receiver, _tokenAmount);
    }

    function swap(
        address _token,
        uint256 _tokenAmount,
        uint256 _allocation,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public nonReentrant {
        require(_tokenAmount > 0, "GmtSwap: Invalid tokenAmount");
        require(_allocation > 0, "GmtSwap: Invalid gmtAllocation");

        _verifyAllocation(msg.sender, _allocation, _v, _r, _s);
        (uint256 transferAmount, uint256 mintAmount) = _getSwapAmounts(_token, _tokenAmount, _allocation);

        IXVIX(xvix).rebase();
        IERC20(_token).transferFrom(msg.sender, address(this), transferAmount);

        if (_token == xvix) {
            IERC20(_token).approve(burnVault, transferAmount);
            IBurnVault(burnVault).deposit(transferAmount);
        }

        IGmtIou(gmtIou).mint(msg.sender, mintAmount);
    }

    function _verifyAllocation(
        address _account,
        uint256 _allocation,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private view {
        bytes32 message = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            "GmtSwap: GmtAllocation",
            _account,
            _allocation
        ));

        require(
            allocator == ecrecover(message, _v, _r, _s),
            "GmtSwap: Invalid signature"
        );
    }

    function _getSwapAmounts(
        address _token,
        uint256 _tokenAmount,
        uint256 _allocation
    ) private view returns (uint256, uint256) {
        require(_token == xvix || _token == uni || _token == xlge, "GmtSwap: unsupported token");
        return (_tokenAmount, _allocation);
    }
}
