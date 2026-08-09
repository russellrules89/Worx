// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkProofToken
/// @notice Testnet-only ERC-20 prototype. An authorized work oracle may mint once
/// per approved-work proof. It is not deployed, audited, or connected to Worx.
contract WorkProofToken {
    string public constant name = "Worx Work Proof";
    string public constant symbol = "WWP";
    uint8 public constant decimals = 0;

    address public owner;
    address public workOracle;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public workProofUsed;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event WorkOracleUpdated(address indexed previousOracle, address indexed newOracle);
    event WorkRewardMinted(bytes32 indexed workProof, address indexed worker, uint256 amount);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error WorkProofAlreadyUsed();

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

    /// @dev `workProof` should be a stable hash of a unique approved submission ID.
    function mintForApprovedWork(address worker, bytes32 workProof, uint256 amount) external onlyWorkOracle {
        if (worker == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (workProofUsed[workProof]) revert WorkProofAlreadyUsed();

        workProofUsed[workProof] = true;
        totalSupply += amount;
        balanceOf[worker] += amount;
        emit Transfer(address(0), worker, amount);
        emit WorkRewardMinted(workProof, worker, amount);
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
