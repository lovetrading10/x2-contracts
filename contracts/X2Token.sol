// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";

contract X2Token is IERC20, IX2Token, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public override _totalSupply;

    address public market;
    address public router;

    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) public allowances;

    mapping (address => uint256) public unlockTimestamps;

    modifier onlyRouter() {
        require(msg.sender == router, "X2Token: forbidden");
        _;
    }

    modifier onlyMarket() {
        require(msg.sender == market, "X2Token: forbidden");
        _;
    }

    constructor(string memory _name, string memory _symbol, address _market, address _router) public {
        name = _name;
        symbol = _symbol;
        market = _market;
        router = _router;
    }

    function deposit(address _account, uint256 _amount) public override onlyRouter nonReentrant returns (uint256) {
        return IX2Market(market).deposit(_account, _amount);
    }

    function withdraw(address _account, address _receiver, uint256 _amount) public override onlyRouter nonReentrant returns (uint256) {
        return IX2Market(market).withdraw(_account, _receiver, _amount);
    }

    function mint(address _account, uint256 _amount) public override onlyMarket {
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) public override onlyMarket {
        _burn(_account, _amount);
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply.div(getDivisor());
    }

    function balanceOf(address _account) public view override returns (uint256) {
        return balances[_account].div(getDivisor());
    }

    function transfer(address _recipient, uint256 _amount) public override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function allowance(address _owner, address _spender) public view override returns (uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) public override returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) public override returns (bool) {
        uint256 nextAllowance = allowances[_sender][msg.sender].sub(_amount, "X2Token: transfer amount exceeds allowance");
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function getDivisor() public view returns (uint256) {
        return IX2Market(market).getDivisor(address(this));
    }

    function unlocked(address _account) public view returns (bool) {
        return block.timestamp > unlockTimestamps[_account];
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(unlocked(_sender), "X2Token: account not yet unlocked");
        require(_sender != address(0), "X2Token: transfer from the zero address");
        require(_recipient != address(0), "X2Token: transfer to the zero address");

        uint256 divisor = getDivisor();
        _decreaseBalance(_sender, _amount, divisor);
        _increaseBalance(_recipient, _amount, divisor);

        emit Transfer(_sender, _recipient, _amount);
    }

    function _mint(address _account, uint256 _amount) private {
        require(_account != address(0), "X2Token: mint to the zero address");
        unlockTimestamps[_account] = IX2Market(market).getNextUnlockTime();

        uint256 divisor = getDivisor();
        _increaseBalance(_account, _amount, divisor);

        emit Transfer(address(0), _account, _amount);
    }

    function _burn(address _account, uint256 _amount) private {
        require(_account != address(0), "X2Token: burn from the zero address");
        require(unlocked(_account), "X2Token: account not yet unlocked");

        uint256 divisor = getDivisor();
        _decreaseBalance(_account, _amount, divisor);

        emit Transfer(_account, address(0), _amount);
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "X2Token: approve from the zero address");
        require(_spender != address(0), "X2Token: approve to the zero address");

        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _increaseBalance(address _account, uint256 _amount, uint256 _divisor) private {
        if (_amount == 0) { return; }

        uint256 scaledAmount = _amount.mul(_divisor);
        balances[_account] = balances[_account].add(scaledAmount);
        _totalSupply = _totalSupply.add(scaledAmount);
    }

    function _decreaseBalance(address _account, uint256 _amount, uint256 _divisor) private {
        if (_amount == 0) { return; }

        uint256 scaledAmount = _amount.mul(_divisor);
        balances[_account] = balances[_account].sub(scaledAmount);
        _totalSupply = _totalSupply.sub(scaledAmount);
    }
}
