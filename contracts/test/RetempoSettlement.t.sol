// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RetempoSettlement} from "../src/RetempoSettlement.sol";

contract UnauthorizedRecorder {
    function tryRecord(RetempoSettlement registry) external returns (bool ok) {
        bytes memory payload = abi.encodeWithSelector(
            RetempoSettlement.recordSettlement.selector,
            "inv_1",
            "svc_1",
            address(0x1001),
            address(0x2002),
            100e6,
            keccak256("arc-reference"),
            1_717_171_717
        );
        (ok,) = address(registry).call(payload);
    }
}

contract RetempoSettlementTest {
    function testAuthorizedOperatorCanRecordSettlement() public {
        RetempoSettlement registry = new RetempoSettlement(address(this));

        bytes32 referenceHash = keccak256("arc-reference");
        bytes32 settlementId = registry.recordSettlement(
            "inv_1",
            "svc_1",
            address(0x1001),
            address(0x2002),
            100e6,
            referenceHash,
            1_717_171_717
        );

        RetempoSettlement.SettlementRecord memory record = registry.getSettlement(settlementId);
        require(record.exists, "record should exist");
        require(keccak256(bytes(record.invoiceId)) == keccak256("inv_1"), "invoice id mismatch");
        require(keccak256(bytes(record.serviceId)) == keccak256("svc_1"), "service id mismatch");
        require(record.payer == address(0x1001), "payer mismatch");
        require(record.merchant == address(0x2002), "merchant mismatch");
        require(record.amount == 100e6, "amount mismatch");
        require(record.referenceHash == referenceHash, "reference hash mismatch");
        require(record.timestamp == 1_717_171_717, "timestamp mismatch");
        require(record.recordedBy == address(this), "operator mismatch");
    }

    function testUnauthorizedCallerCannotRecordSettlement() public {
        RetempoSettlement registry = new RetempoSettlement(address(this));
        UnauthorizedRecorder unauthorized = new UnauthorizedRecorder();

        bool ok = unauthorized.tryRecord(registry);

        require(!ok, "unauthorized recorder should fail");
    }

    function testOwnerCanRotateAuthorizedOperator() public {
        RetempoSettlement registry = new RetempoSettlement(address(this));
        registry.setAuthorizedOperator(address(0xBEEF));

        require(registry.authorizedOperator() == address(0xBEEF), "operator was not updated");
    }

    function testDuplicateSettlementCannotBeRecorded() public {
        RetempoSettlement registry = new RetempoSettlement(address(this));
        bytes32 referenceHash = keccak256("arc-reference");

        registry.recordSettlement(
            "inv_1",
            "svc_1",
            address(0x1001),
            address(0x2002),
            100e6,
            referenceHash,
            1_717_171_717
        );

        bytes memory payload = abi.encodeWithSelector(
            RetempoSettlement.recordSettlement.selector,
            "inv_1",
            "svc_1",
            address(0x1001),
            address(0x2002),
            100e6,
            referenceHash,
            1_717_171_717
        );
        (bool ok,) = address(registry).call(payload);

        require(!ok, "duplicate settlement should fail");
    }
}
