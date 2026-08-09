// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkProofToken
/// @notice Testnet-only ERC-20 prototype. Supply is backed by approved work and
/// active, contracted future work. Optional staking rewards are funded from WWP
/// already held by the rewards pool; they never mint unbacked supply.
contract WorkProofToken {
    string public constant name = "Worx Work Proof";
    string public constant symbol = "WWP";
    uint8 public constant decimals = 0;
    uint256 private constant REWARD_PRECISION = 1e18;

    address public owner;
    address public workOracle;
    uint256 public totalSupply;
    uint256 public approvedWorkVolume;
    uint256 public activeContractedWorkVolume;
    uint256 public totalStaked;
    uint256 public rewardRate;
    uint256 public rewardPeriodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public workProofUsed;
    mapping(bytes32 => bool) public contractedWorkRegistered;
    mapping(bytes32 => uint256) public contractedWorkRemaining;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public accruedRewards;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event WorkOracleUpdated(address indexed previousOracle, address indexed newOracle);
    event WorkRewardMinted(bytes32 indexed workProof, bytes32 indexed contractProof, address indexed worker, uint256 amount);
    event FutureWorkContractRegistered(bytes32 indexed contractProof, uint256 amount);
    event FutureWorkContractCancelled(bytes32 indexed contractProof, uint256 unfulfilledAmount);
    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardFunded(uint256 amount, uint256 duration);
    event RewardClaimed(address indexed account, uint256 amount);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error WorkProofAlreadyUsed();
    error ContractAlreadyRegistered();
    error SupplyExceedsBackedVolume();
    error InsufficientRewardFunding();
    error RewardPeriodActive();

    constructor(address initialWorkOracle) {
        if (initialWorkOracle == address(0)) revert InvalidAddress();
        owner = msg.sender;
        workOracle = initialWorkOracle;
        emit WorkOracleUpdated(address(0), initialWorkOracle);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyWorkOracle() {
        if (msg.sender != workOracle) revert Unauthorized();
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            accruedRewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function setWorkOracle(address newWorkOracle) external onlyOwner {
        if (newWorkOracle == address(0)) revert InvalidAddress();
        emit WorkOracleUpdated(workOracle, newWorkOracle);
        workOracle = newWorkOracle;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < rewardPeriodFinish ? block.timestamp : rewardPeriodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * REWARD_PRECISION / totalStaked);
    }

    function earned(address account) public view returns (uint256) {
        return stakedBalance[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / REWARD_PRECISION + accruedRewards[account];
    }

    /// @dev `contractProof` should be a stable hash of an enforceable future-work agreement.
    function registerFutureWorkContract(bytes32 contractProof, uint256 amount) external onlyWorkOracle {
        if (amount == 0) revert InvalidAmount();
        if (contractedWorkRegistered[contractProof]) revert ContractAlreadyRegistered();
        contractedWorkRegistered[contractProof] = true;
        contractedWorkRemaining[contractProof] = amount;
        activeContractedWorkVolume += amount;
        emit FutureWorkContractRegistered(contractProof, amount);
    }

    function cancelFutureWorkContract(bytes32 contractProof) external onlyWorkOracle {
        uint256 unfulfilledAmount = contractedWorkRemaining[contractProof];
        if (unfulfilledAmount == 0) revert InvalidAmount();
        if (totalSupply > approvedWorkVolume + activeContractedWorkVolume - unfulfilledAmount) revert SupplyExceedsBackedVolume();
        contractedWorkRemaining[contractProof] = 0;
        activeContractedWorkVolume -= unfulfilledAmount;
        emit FutureWorkContractCancelled(contractProof, unfulfilledAmount);
    }

    /// @dev `workProof` is a stable hash of a unique approved submission ID.
    function mintForApprovedWork(address worker, bytes32 workProof, bytes32 contractProof, uint256 amount) external onlyWorkOracle {
        if (worker == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (workProofUsed[workProof]) revert WorkProofAlreadyUsed();
        if (contractProof != bytes32(0)) {
            if (contractedWorkRemaining[contractProof] < amount) revert InvalidAmount();
            contractedWorkRemaining[contractProof] -= amount;
            activeContractedWorkVolume -= amount;
        }
        workProofUsed[workProof] = true;
        approvedWorkVolume += amount;
        totalSupply += amount;
        balanceOf[worker] += amount;
        emit Transfer(address(0), worker, amount);
        emit WorkRewardMinted(workProof, contractProof, worker, amount);
    }

    /// @notice Fund a reward period by transferring already-issued WWP from the oracle.
    /// @dev A new period may start only after the prior period ends, avoiding reward-budget overlap.
    function fundStakingRewards(uint256 amount, uint256 duration) external onlyWorkOracle updateReward(address(0)) {
        if (amount == 0 || duration == 0) revert InvalidAmount();
        if (block.timestamp < rewardPeriodFinish) revert RewardPeriodActive();
        _transfer(msg.sender, address(this), amount);
        if (balanceOf[address(this)] < totalStaked + amount) revert InsufficientRewardFunding();
        rewardRate = amount / duration;
        if (rewardRate == 0) revert InvalidAmount();
        rewardPeriodFinish = block.timestamp + duration;
        lastUpdateTime = block.timestamp;
        emit RewardFunded(amount, duration);
    }

    function stake(uint256 amount) external updateReward(msg.sender) {
        if (amount == 0) revert InvalidAmount();
        _transfer(msg.sender, address(this), amount);
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public updateReward(msg.sender) {
        if (amount == 0 || stakedBalance[msg.sender] < amount) revert InvalidAmount();
        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;
        _transfer(address(this), msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claimStakingRewards() public updateReward(msg.sender) {
        uint256 reward = accruedRewards[msg.sender];
        if (reward == 0) return;
        accruedRewards[msg.sender] = 0;
        _transfer(address(this), msg.sender, reward);
        emit RewardClaimed(msg.sender, reward);
    }

    function exit() external {
        if (stakedBalance[msg.sender] > 0) withdraw(stakedBalance[msg.sender]);
        claimStakingRewards();
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved != type(uint256).max) allowance[from][msg.sender] = approved - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[from] < amount) revert InvalidAmount();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
