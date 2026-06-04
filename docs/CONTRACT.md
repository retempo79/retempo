# Retempo Smart Contract Boundary v0.1

## Contract name

RetempoSettlement

## Core decision

RetempoSettlement is a settlement registry.

It is not a billing engine, escrow contract, token vault, or subscription manager.

## Core function

recordSettlement

## Core event

SettlementRecorded

## Data recorded

- invoiceId
- serviceId
- payer
- merchant
- amount
- referenceHash
- timestamp

## Onchain responsibility

The contract records settlement proof and emits settlement events.

## Offchain responsibility

The backend manages:

- subscription lifecycle
- usage metering
- invoice calculation
- retry logic
- billing intervals
- dashboard state
- API usage quota

## Authorization

Only an authorized Retempo operator wallet should be allowed to record settlements.

The Arc Testnet operator wallet is configured locally through backend environment variables.
Retempo v0.1 does not use Circle integration for settlement registry submission.
