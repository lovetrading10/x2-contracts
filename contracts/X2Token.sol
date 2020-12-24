// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./libraries/token/IERC20.sol";
import "./libraries/token/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IX2Factory.sol";
import "./interfaces/IX2Market.sol";
import "./interfaces/IX2Token.sol";

// farming code adapated from https://github.com/trusttoken/smart-contracts/blob/master/contracts/truefi/TrueFarm.sol
contract X2Token is IERC20, IX2Token, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Ledger {
        uint128 balance;
        uint128 cost;
    }

    struct Reward {
        uint128 previousCumulativeRewardPerToken;
        uint128 claimable;
    }

    uint256 constant PRECISION = 1e30;
    uint256 constant MAX_BALANCE = uint128(-1);
    uint256 constant MAX_REWARD = uint128(-1);

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    // _totalSupply also tracks totalStaked
    uint256 public override _totalSupply;

    address public override market;

    // ledgers track balances and costs
    mapping (address => Ledger) public ledgers;
    mapping (address => mapping (address => uint256)) public allowances;

    // track previous cumulated rewards and claimable rewards for accounts
    mapping(address => Reward) public rewards;
    // track overall cumulative rewards
    uint256 public cumulativeRewardPerToken;
    // track total rewards
    uint256 public totalClaimedRewards;
    uint256 public totalFarmRewards;

    bool public isInitialized;

    modifier onlyMarket() {
        require(msg.sender == market, "X2Token: forbidden");
        _;
    }

    function initialize(address _market, string memory _symbol) public {
        require(!isInitialized, "X2Token: already initialized");
        isInitialized = true;
        market = _market;
        name = _symbol;
        symbol = _symbol;
    }

    function mint(address _account, uint256 _amount, uint256 _divisor) public override onlyMarket {
        _mint(_account, _amount, _divisor);
    }

    function burn(address _account, uint256 _amount) public override onlyMarket {
        _burn(_account, _amount);
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply.div(getDivisor());
    }

    function balanceOf(address _account) public view override returns (uint256) {
        return uint256(ledgers[_account].balance).div(getDivisor());
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

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        IX2Market(market).rebase();

        require(_sender != address(0), "X2Token: transfer from the zero address");
        require(_recipient != address(0), "X2Token: transfer to the zero address");

        uint256 divisor = getDivisor();
        _decreaseBalance(_sender, _amount, divisor);
        _increaseBalance(_recipient, _amount, divisor);

        emit Transfer(_sender, _recipient, _amount);
    }

    function _mint(address _account, uint256 _amount, uint256 _divisor) private {
        require(_account != address(0), "X2Token: mint to the zero address");

        _increaseBalance(_account, _amount, _divisor);

        emit Transfer(address(0), _account, _amount);
    }

    function _burn(address _account, uint256 _amount) private {
        require(_account != address(0), "X2Token: burn from the zero address");

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

        uint256 cachedTotalSupply = _totalSupply;
        _updateFarm(_account, cachedTotalSupply);
        uint256 scaledAmount = _amount.mul(_divisor);
        uint256 nextBalance = uint256(ledgers[_account].balance).add(scaledAmount);
        require(nextBalance < MAX_BALANCE, "X2Token: balance limit exceeded");
        ledgers[_account] = Ledger(
            uint128(nextBalance),
            uint128(nextBalance.div(_divisor)) // current cost
        );
        _totalSupply = cachedTotalSupply.add(scaledAmount);
    }

    function _decreaseBalance(address _account, uint256 _amount, uint256 _divisor) private {
        if (_amount == 0) { return; }

        uint256 cachedTotalSupply = _totalSupply;
        _updateFarm(_account, cachedTotalSupply);
        uint256 scaledAmount = _amount.mul(_divisor);
        uint256 nextBalance = uint256(ledgers[_account].balance).sub(scaledAmount);
        ledgers[_account] = Ledger(
            uint128(nextBalance),
            uint128(nextBalance.div(_divisor)) // current cost
        );
        _totalSupply = cachedTotalSupply.sub(scaledAmount);
    }

    function _updateFarm(address _account, uint256 cachedTotalSupply) private {
        IX2Market(market).distribute(address(this));
        uint256 newTotalFarmRewards = address(this).balance.add(totalClaimedRewards).mul(PRECISION);
        // calculate block reward
        uint256 totalBlockReward = newTotalFarmRewards.sub(totalFarmRewards);
        // update farm rewards
        totalFarmRewards = newTotalFarmRewards;

        uint256 _cumulativeRewardPerToken = cumulativeRewardPerToken;
        // if there are stakers
        if (_totalSupply > 0) {
            _cumulativeRewardPerToken = _cumulativeRewardPerToken.add(totalBlockReward.div(cachedTotalSupply));
            cumulativeRewardPerToken = _cumulativeRewardPerToken;
        }
        require(_cumulativeRewardPerToken < MAX_REWARD, "X2Token: cumulativeRewardPerToken limit exceeded");

        Reward memory reward = rewards[_account];
        uint256 claimableReward = uint256(reward.claimable).add(
            uint256(ledgers[_account].balance).mul(_cumulativeRewardPerToken.sub(reward.previousCumulativeRewardPerToken)).div(PRECISION)
        );
        require(claimableReward < MAX_REWARD, "X2Token: claimableReward limit exceeded");

        rewards[_account] = Reward(
            uint128(claimableReward),
            // update previous cumulative reward for sender
            uint128(cumulativeRewardPerToken)
        );
    }
}
