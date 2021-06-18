//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../interfaces/IGmxIou.sol";

contract GmxMigration is ReentrancyGuard {
    using SafeMath for uint256;

    uint256 constant PRECISION = 1000000;

    bool public isInitialized;
    bool public isSwapActive = true;

    address public xvix;
    address public uni;
    address public xlge;
    address public xvixGmxIou;
    address public uniGmxIou;
    address public xlgeGmxIou;

    uint256 public gmxPrice;
    uint256 public xvixPrice;
    uint256 public uniPrice;
    uint256 public xlgePrice;

    address public admin;
    address public approver;

    mapping (bytes32 => bool) public pendingActions;

    event SignalPendingAction(bytes32 action);
    event SignalApprove(address token, address spender, uint256 amount, bytes32 action);
    event ClearAction(bytes32 action);

    constructor() public {
        admin = msg.sender;
        approver = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "GmxMigration: forbidden");
        _;
    }

    modifier onlyApprover() {
        require(msg.sender == approver, "GmxMigration: forbidden");
        _;
    }

    function initialize(
        address[] memory _addresses,
        uint256 _xvixPrice,
        uint256 _uniPrice,
        uint256 _xlgePrice,
        uint256 _gmxPrice
    ) public onlyAdmin {
        require(!isInitialized, "GmxMigration: already initialized");
        isInitialized = true;

        xvix = _addresses[0];
        uni = _addresses[1];
        xlge = _addresses[2];

        xvixGmxIou = _addresses[3];
        uniGmxIou = _addresses[3];
        xlgeGmxIou = _addresses[3];

        xvixPrice = _xvixPrice;
        uniPrice = _uniPrice;
        xlgePrice = _xlgePrice;
        gmxPrice = _gmxPrice;
    }

    function setApprover(address _approver) public onlyApprover {
        approver = _approver;
    }

    function endSwap() public onlyAdmin {
        isSwapActive = false;
    }

    function swap(
        address _token,
        uint256 _tokenAmount
    ) public nonReentrant {
        require(isSwapActive, "GmxMigration: swap is no longer active");
        require(_token == xvix || _token == uni || _token == xlge, "GmxMigration: unsupported token");
        require(_tokenAmount > 0, "GmxMigration: invalid tokenAmount");

        uint256 tokenPrice = getTokenPrice(_token);
        uint256 mintAmount = _tokenAmount.mul(tokenPrice).div(gmxPrice);
        require(mintAmount > 0, "GmxMigration: invalid mintAmount");

        IERC20(_token).transferFrom(msg.sender, address(this), _tokenAmount);

        address iouToken = getIouToken(_token);
        IGmxIou(iouToken).mint(msg.sender, mintAmount);
    }

    function getTokenPrice(address _token) public view returns (uint256) {
        if (_token == xvix) {
            return xvixPrice;
        }
        if (_token == uni) {
            return uniPrice;
        }
        if (_token == xlge) {
            return xlgePrice;
        }
        revert("GmxMigration: unsupported token");
    }

    function getIouToken(address _token) public view returns (address) {
        if (_token == xvix) {
            return xvixGmxIou;
        }
        if (_token == uni) {
            return uniGmxIou;
        }
        if (_token == xlge) {
            return xlgeGmxIou;
        }
        revert("GmxMigration: unsupported token");
    }

    function signalApprove(address _token, address _spender, uint256 _amount) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("approve", _token, _spender, _amount));
        _setPendingAction(action);
        emit SignalApprove(_token, _spender, _amount, action);
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyApprover {
        bytes32 action = keccak256(abi.encodePacked("approve", _token, _spender, _amount));
        _validateAction(action);
        IERC20(_token).approve(_spender, _amount);
        _clearAction(action);
    }

    function _setPendingAction(bytes32 _action) private {
        pendingActions[_action] = true;
        emit SignalPendingAction(_action);
    }

    function _validateAction(bytes32 _action) private view {
        require(pendingActions[_action], "GmxMigration: action not signalled");
    }

    function _clearAction(bytes32 _action) private {
        require(pendingActions[_action], "GmxMigration: invalid _action");
        delete pendingActions[_action];
        emit ClearAction(_action);
    }
}
