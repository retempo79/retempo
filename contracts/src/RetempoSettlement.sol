// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RetempoSettlement {
    struct SettlementRecord {
        string invoiceId;
        string serviceId;
        address payer;
        address merchant;
        uint256 amount;
        bytes32 referenceHash;
        uint256 timestamp;
        address recordedBy;
        bool exists;
    }

    address public owner;
    address public authorizedOperator;

    mapping(bytes32 => SettlementRecord) private settlementRecords;

    event AuthorizedOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event SettlementRecorded(
        bytes32 indexed settlementId,
        string invoiceId,
        string serviceId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 referenceHash,
        uint256 timestamp
    );

    error NotOwner();
    error NotAuthorizedOperator();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidTimestamp();
    error SettlementAlreadyRecorded();

    constructor(address initialOperator) {
        if (initialOperator == address(0)) revert InvalidAddress();
        owner = msg.sender;
        authorizedOperator = initialOperator;
        emit AuthorizedOperatorUpdated(address(0), initialOperator);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorizedOperator() {
        if (msg.sender != authorizedOperator) revert NotAuthorizedOperator();
        _;
    }

    function setAuthorizedOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert InvalidAddress();
        address previousOperator = authorizedOperator;
        authorizedOperator = newOperator;
        emit AuthorizedOperatorUpdated(previousOperator, newOperator);
    }

    function recordSettlement(
        string calldata invoiceId,
        string calldata serviceId,
        address payer,
        address merchant,
        uint256 amount,
        bytes32 referenceHash,
        uint256 timestamp
    ) external onlyAuthorizedOperator returns (bytes32 settlementId) {
        if (payer == address(0) || merchant == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (timestamp == 0) revert InvalidTimestamp();

        settlementId = computeSettlementId(invoiceId, serviceId, payer, merchant, amount, referenceHash, timestamp);
        if (settlementRecords[settlementId].exists) revert SettlementAlreadyRecorded();

        settlementRecords[settlementId] = SettlementRecord({
            invoiceId: invoiceId,
            serviceId: serviceId,
            payer: payer,
            merchant: merchant,
            amount: amount,
            referenceHash: referenceHash,
            timestamp: timestamp,
            recordedBy: msg.sender,
            exists: true
        });

        emit SettlementRecorded(
            settlementId,
            invoiceId,
            serviceId,
            payer,
            merchant,
            amount,
            referenceHash,
            timestamp
        );
    }

    function getSettlement(bytes32 settlementId) external view returns (SettlementRecord memory) {
        return settlementRecords[settlementId];
    }

    function computeSettlementId(
        string calldata invoiceId,
        string calldata serviceId,
        address payer,
        address merchant,
        uint256 amount,
        bytes32 referenceHash,
        uint256 timestamp
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(invoiceId, serviceId, payer, merchant, amount, referenceHash, timestamp));
    }
}
