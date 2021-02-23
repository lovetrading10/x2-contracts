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
    address public weth;
    address public dai;
    address public wethDaiUni;
    address public wethXvixUni;
    address public allocator;
    address public burnVault;
    uint256 public minXvixPrice;
    uint256 public unlockTime;
    address public gov;

    constructor(
        address _xvix,
        address _uni,
        address _xlge,
        address _gmtIou,
        address _weth,
        address _dai,
        address _wethDaiUni,
        address _wethXvixUni,
        address _allocator,
        uint256 _unlockTime,
        uint256 _minXvixPrice,
        address _burnVault
    ) public {
        xvix = _xvix;
        uni = _uni;
        xlge = _xlge;
        gmtIou = _gmtIou;

        weth = _weth;
        dai = _dai;
        wethDaiUni = _wethDaiUni;
        wethXvixUni = _wethXvixUni;

        allocator = _allocator;
        unlockTime = _unlockTime;
        minXvixPrice = _minXvixPrice;
        burnVault = _burnVault;

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
        (uint256 transferAmount, uint256 mintAmount) = getSwapAmounts(
            msg.sender, _token, _tokenAmount, _allocation);
        require(transferAmount > 0, "GmtSwap: Invalid transferAmount");
        require(mintAmount > 0, "GmtSwap: Invalid mintAmount");

        IXVIX(xvix).rebase();
        IERC20(_token).transferFrom(msg.sender, address(this), transferAmount);

        if (_token == xvix) {
            IERC20(_token).approve(burnVault, transferAmount);
            IBurnVault(burnVault).deposit(transferAmount);
        }

        IGmtIou(gmtIou).mint(msg.sender, mintAmount);
    }

    function getSwapAmounts(
        address _account,
        address _token,
        uint256 _tokenAmount,
        uint256 _allocation
    ) public view returns (uint256, uint256) {
        require(_token == xvix || _token == uni || _token == xlge, "GmtSwap: unsupported token");
        uint256 tokenPrice = getTokenPrice(_token);
        uint256 rate = tokenPrice.mul(10).div(45);

        uint256 transferAmount = _tokenAmount;
        uint256 mintAmount = _tokenAmount.mul(rate);

        uint256 gmtIouBalance = IERC20(gmtIou).balanceOf(_account);
        uint256 maxMintAmount = _allocation.sub(gmtIouBalance);

        if (mintAmount > maxMintAmount) {
            mintAmount = maxMintAmount;
            transferAmount = mintAmount.div(rate);
        }

        return (transferAmount, mintAmount);
    }

    function getTokenPrice(address _token) public view returns (uint256) {
        if (_token == xlge) {
            return uint256(22500);
        }
        if (_token == xvix) {
            return getXvixPrice();
        }
        if (_token == uni) {
            return getUniPrice();
        }
        revert("GmtSwap: unsupported token");
    }

    function getEthPrice() public view returns (uint256) {
        uint256 wethBalance = IERC20(weth).balanceOf(wethDaiUni);
        uint256 daiBalance = IERC20(dai).balanceOf(wethDaiUni);
        return daiBalance.div(wethBalance);
    }

    function getXvixPrice() public view returns (uint256) {
        uint256 ethPrice = getEthPrice();
        uint256 wethBalance = IERC20(weth).balanceOf(wethXvixUni);
        uint256 xvixBalance = IERC20(xvix).balanceOf(wethXvixUni);
        uint256 price = wethBalance.mul(ethPrice).div(xvixBalance);
        if (price < minXvixPrice) {
            return minXvixPrice;
        }
        return price;
    }

    function getUniPrice() public view returns (uint256) {
        uint256 ethPrice = getEthPrice();
        uint256 wethBalance = IERC20(weth).balanceOf(wethXvixUni);
        uint256 supply = IERC20(wethXvixUni).totalSupply();
        return wethBalance.mul(ethPrice).mul(2).div(supply);
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
}
