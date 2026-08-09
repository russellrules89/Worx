// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkProofToken
/// @notice Testnet-only ERC-20 prototype. Supply is capped by approved work plus
/// active, contracted future work registered by the authorized work oracle.
contract WorkProofToken {
    string public constant name = "Worx Work Proof";
    string public constant symbol = "WWP";
    uint8 public constant decimals = 0;

    address public owner;
    address public workOracle;
    uint256 public totalSupply;
    uint256 public approvedWorkVolume;
    uint256 public activeContractedWorkVolume;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public workProofUsed;
    mapping(bytes32 => bool) public contractedWorkRegistered;
    mapping(bytes32 => uint256) public contractedWorkRemaining;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event WorkOracleUpdated(address indexed previousOracle, address indexed newOracle);
    event WorkRewardMinted(bytes32 indexed workProof, bytes32 indexed contractProof, address indexed worker, uint256 amount);
    event FutureWorkContractRegistered(bytes32 indexed contractProof, uint256 amount);
    event FutureWorkContractCancelled(bytes32 indexed contractProof, uint256 unfulfilledAmount);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error WorkProofAlreadyUsed();
    error ContractAlreadyRegistered();
    error SupplyExceedsBackedVolume();

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

    function setWorkOracle(address newWorkOracle) external onlyOwner {
        if (newWorkOracle == address(0)) revert InvalidAddress();
        emit WorkOracleUpdated(workOracle, newWorkOracle);
        workOracle = newWorkOracle;
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

    /// @notice Removes only unissued future capacity. Cancellation cannot reduce supply below backing.
    function cancelFutureWorkContract(bytes32 contractProof) external onlyWorkOracle {
        uint256 unfulfilledAmount = contractedWorkRemaining[contractProof];
        if (unfulfilledAmount == 0) revert InvalidAmount();
        if (totalSupply > approvedWorkVolume + activeContractedWorkVolume - unfulfilledAmount) revert SupplyExceedsBackedVolume();
        contractedWorkRemaining[contractProof] = 0;
        activeContractedWorkVolume -= unfulfilledAmount;
        emit FutureWorkContractCancelled(contractProof, unfulfilledAmount);
    }

    /// @dev `workProof` should be a stable hash of a unique approved submission ID.
    /// @dev Pass `bytes32(0)` when approved work is not linked to a future-work contract.
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
