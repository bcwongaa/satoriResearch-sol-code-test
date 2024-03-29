// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract LockWithReward is Ownable, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

    IERC20Metadata public underlying;
    IERC20Metadata public rewardToken;
    uint public startTime;
    uint public endTime;
    uint256 public lockIdCounter = 0;

    uint256 public level1AmountThreshold;
    uint256 public level2AmountThreshold;

    uint256 public level1LockTime;
    uint256 public level2LockTime;

    enum LockLevel {
        Level1,
        Level2,
        Level3
    }

    struct Lock {
        uint256 amount;
        uint lockTime;
    }

    mapping(address => mapping(uint256 => Lock)) public balances;
    mapping(address => uint256[]) private balancesIndexes;

    // Allow to start in the past (i.e. can lock right away and no configs can be changed)
    constructor(
        address _underlying,
        address _rewardToken,
        uint _startTime,
        uint _endTime
    ) Ownable(msg.sender) {
        require(msg.sender != address(0), 'Sender address cannot be zero');
        require(_underlying != address(0), 'Underlying address cannot be zero');
        require(
            _rewardToken != address(0),
            'Reward Token address cannot be zero'
        );
        require(
            _underlying != _rewardToken,
            'Underlying and Reward Token cannot be the same'
        );
        require(
            _startTime < _endTime,
            'Start Time should be earlier than end time'
        );
        require(block.timestamp < _endTime, 'End time should be in the future');

        super._grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        underlying = IERC20Metadata(_underlying);
        rewardToken = IERC20Metadata(_rewardToken);
        startTime = _startTime;
        endTime = _endTime;

        level1AmountThreshold = 500 * 10 ** underlying.decimals();
        level2AmountThreshold = 2000 * 10 ** underlying.decimals();
        level1LockTime = 10 days;
        level2LockTime = 20 days;
    }

    modifier onlyValidTime(uint start, uint end) {
        require(start < end, 'Start Time should be earlier than end time');
        _;
    }

    modifier onlyChangeConfigBeforeStartTime() {
        require(
            startTime > block.timestamp,
            'Configuartion cannot be changed after starting'
        );
        _;
    }

    modifier onlyWithinLockTime() {
        require(block.timestamp > startTime, 'Lock time not started');
        require(block.timestamp < endTime, 'Lock time has passed');
        _;
    }

    modifier onlyAfterEndTime() {
        require(
            block.timestamp >= endTime,
            'Function can only be called after end time'
        );
        _;
    }

    function totalLockedAmount() public view returns (uint256) {
        uint256 totalLocked = 0;
        uint256[] storage indexes = balancesIndexes[msg.sender];
        for (uint256 i = 0; i < indexes.length; i++) {
            Lock storage balance = balances[msg.sender][indexes[i]];
            totalLocked += balance.amount;
        }
        return totalLocked;
    }

    function lock(uint256 _amount) public onlyWithinLockTime returns (uint256) {
        require(_amount > 0, 'Amount must be greater than zero');
        require(
            underlying.transferFrom(msg.sender, address(this), _amount),
            'Transfer failed'
        );

        balances[msg.sender][lockIdCounter] = Lock({
            amount: _amount,
            lockTime: block.timestamp
        });
        balancesIndexes[msg.sender].push(lockIdCounter);

        return lockIdCounter++;
    }

    // Only Allow the user to withdraw and invalidates all claimables before end time.
    // Should remove?
    function withdraw() public onlyWithinLockTime {
        //Check
        require(
            balancesIndexes[msg.sender].length > 0,
            'No locked balance to withdraw'
        );

        uint256 totalLocked = 0;
        uint256[] storage indexes = balancesIndexes[msg.sender];
        for (uint256 i = 0; i < indexes.length; i++) {
            Lock storage balance = balances[msg.sender][indexes[i]];
            totalLocked += balance.amount;
        }

        // Effects
        for (uint256 i = 0; i < indexes.length; i++) {
            balances[msg.sender][indexes[i]].amount = 0;
        }

        // Interactions
        require(
            underlying.transfer(msg.sender, totalLocked),
            'Transfer failed'
        );
    }

    function claimAndWithdraw() public onlyAfterEndTime {
        // Checks
        require(
            balancesIndexes[msg.sender].length > 0,
            'No locked balance to claim and withdraw'
        );

        uint256 totalLocked = 0;
        uint256 totalReward = 0;
        uint256[] storage indexes = balancesIndexes[msg.sender];
        for (uint256 i = 0; i < indexes.length; i++) {
            totalLocked += balances[msg.sender][i].amount;
            totalReward += _calculateReward(i);
        }

        // Effects
        for (uint256 i = 0; i < indexes.length; i++) {
            balances[msg.sender][indexes[i]].amount = 0;
        }

        // Interactions
        require(
            underlying.transfer(msg.sender, totalLocked),
            'Underlying transfer failed'
        );
        require(
            rewardToken.transfer(msg.sender, totalReward),
            'Reward token transfer failed'
        );
    }

    function getClaimable() public view returns (uint256) {
        uint256 totalReward = 0;
        uint256[] storage indexes = balancesIndexes[msg.sender];
        for (uint256 i = 0; i < indexes.length; i++) {
            totalReward += _calculateReward(i);
        }
        return totalReward;
    }

    function _calculateReward(uint256 index) internal view returns (uint256) {
        Lock storage balance = balances[msg.sender][index];
        // Base reward
        uint256 reward = (balance.amount * 10 ** rewardToken.decimals()) /
            (10 ** underlying.decimals());
        // Amount Reward
        if (balance.amount > level2AmountThreshold) {
            // 1.75 = 7 / 4
            reward = (reward * 7) / 4;
        } else if (balance.amount > level1AmountThreshold) {
            // 1.5 = 3 / 2
            reward = (reward * 3) / 2;
        }

        // Lock Time Reward
        if (endTime - balance.lockTime > level2LockTime) {
            reward += (reward * 30) / 100;
        } else if (endTime - balance.lockTime > level1LockTime) {
            reward += (reward * 20) / 100;
        }

        return reward;
    }

    // Admin Functions
    function setTime(
        uint _startTime,
        uint _endTime
    )
        external
        onlyRole(ADMIN_ROLE)
        onlyChangeConfigBeforeStartTime
        onlyValidTime(_startTime, _endTime)
    {
        require(block.timestamp < _endTime, 'End time should be in the future');
        startTime = _startTime;
        endTime = _endTime;
    }

    function setLevelAmountThreshold(
        uint256 _level1AmountThreshold,
        uint256 _level2AmountThreshold
    ) external onlyRole(ADMIN_ROLE) onlyChangeConfigBeforeStartTime {
        require(
            _level1AmountThreshold < _level2AmountThreshold,
            'Level 1 threshold must be less than level 2 threshold'
        );
        level1AmountThreshold = _level1AmountThreshold;
        level2AmountThreshold = _level2AmountThreshold;
    }

    function setLevelLockTime(
        uint256 _level1LockTime,
        uint256 _level2LockTime
    ) external onlyRole(ADMIN_ROLE) onlyChangeConfigBeforeStartTime {
        require(
            _level1LockTime < _level2LockTime,
            'Level 1 lock time must be less than level 2 lock days'
        );
        level1LockTime = _level1LockTime;
        level2LockTime = _level2LockTime;
    }
}
