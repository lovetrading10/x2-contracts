// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";
import "./interfaces/IWETH.sol";

contract X2Token is IERC20, IX2Token, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public _totalSupply;

    address public market;
    address public factory;

    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) public allowances;

    mapping (address => uint256) public unlockTimestamps;

    constructor(string memory _name, string memory _symbol, address _market, address _factory) public {
        name = _name;
        symbol = _symbol;
        market = _market;
        factory = _factory;
    }

    receive() external payable {
        require(msg.sender == IX2Factory(factory).weth(), "X2Token: unsupported sender");
    }

    function deposit(address _receiver, uint256 _amount) public override nonReentrant returns (bool) {
        _mint(_receiver, _amount);
        IX2Market(market).deposit(_amount);
        return true;
    }

    function withdraw(address _receiver, uint256 _amount) public nonReentrant returns (bool) {
        _burn(msg.sender, _amount);
        IX2Market(market).withdraw(_receiver, _amount);
        return true;
    }

    function withdrawETH(address _receiver, uint256 _amount) public nonReentrant returns (bool) {
        _burn(msg.sender, _amount);
        uint256 withdrawAmount = IX2Market(market).withdraw(address(this), _amount);
        IWETH(IX2Factory(factory).weth()).withdraw(withdrawAmount);

        (bool success,) = _receiver.call{value: withdrawAmount}("");
        require(success, "X2Token: eth transfer failed");
        return true;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply.div(divisor());
    }

    function balanceOf(address _account) public view override returns (uint256) {
        return balances[_account].div(divisor());
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

    function divisor() public view returns (uint256) {
        return IX2Market(market).divisors(address(this));
    }

    function unlocked(address _account) public view returns (bool) {
        return block.timestamp > unlockTimestamps[_account];
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(unlocked(_sender), "X2Token: account not yet unlocked");
        require(_sender != address(0), "X2Token: transfer from the zero address");
        require(_recipient != address(0), "X2Token: transfer to the zero address");

        _decreaseBalance(_sender, _amount);
        _increaseBalance(_recipient, _amount);

        emit Transfer(_sender, _recipient, _amount);
    }

    function _mint(address _account, uint256 _amount) private {
        require(_account != address(0), "X2Token: mint to the zero address");
        // lock the account for a repricing interval
        unlockTimestamps[_account] = IX2Market(market).getNextUnlockTimestamp();

        balances[_account] = balances[_account].add(_amount);
        _totalSupply = _totalSupply.add(_amount);
        emit Transfer(address(0), _account, _amount);
    }

    function _burn(address _account, uint256 _amount) private {
        // accounts can only burn after the unlocked time has passed
        require(unlocked(_account), "X2Token: account not yet unlocked");
        require(_account != address(0), "X2Token: burn from the zero address");

        balances[_account] = balances[_account].sub(_amount, "X2Token: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(_amount);
        emit Transfer(_account, address(0), _amount);
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "X2Token: approve from the zero address");
        require(_spender != address(0), "X2Token: approve to the zero address");

        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _increaseBalance(address _account, uint256 _amount) private {
        if (_amount == 0) { return; }

        uint256 scaledAmount = _amount.mul(divisor());
        balances[_account] = balances[_account].add(divisor());
        _totalSupply = _totalSupply.add(scaledAmount);
    }

    function _decreaseBalance(address _account, uint256 _amount) private {
        if (_amount == 0) { return; }

        uint256 scaledAmount = _amount.mul(divisor());
        balances[_account] = balances[_account].sub(divisor());
        _totalSupply = _totalSupply.sub(scaledAmount);
    }
}
