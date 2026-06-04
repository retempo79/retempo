# Retempo API Boundary v0.1

## API root

/api/v1

## Core endpoints

- POST /services
- GET /services
- GET /services/:serviceId
- POST /services/:serviceId/plans
- GET /services/:serviceId/plans
- POST /checkout-sessions
- GET /checkout-sessions/:checkoutSessionId
- POST /usage-events
- POST /invoices
- GET /invoices/:invoiceId
- POST /settlements
- GET /settlements/:settlementId

## Settlement creation

`POST /api/v1/settlements` creates or updates a settlement database record and submits a real
Arc Testnet transaction to `RetempoSettlement.recordSettlement(...)`.

Required request fields:

- `invoiceId`
- `referenceHash` as a 32-byte hex value
- `payerAddress` as the wallet address recorded onchain, unless Circle mode should default to `CIRCLE_WALLET_ID`
- `merchantAddress` as the wallet address recorded onchain, unless Circle mode should default to `CIRCLE_WALLET_ID`

Optional request fields:

- `payerId`, defaulting to the invoice user
- `merchantId`, defaulting to the service owner
- `amount`, defaulting to the invoice amount
- `currency`, defaulting to the invoice currency
- `recordedAt`, defaulting to the current server time

The backend stores only a real onchain transaction hash returned by the configured settlement
executor. In `SETTLEMENT_EXECUTION_MODE="circle"`, the backend submits the contract call with
Circle Developer-Controlled Wallets and verifies the Circle-returned `txHash` against Arc RPC. In
`SETTLEMENT_EXECUTION_MODE="direct"`, the backend uses the local direct Arc private-key path for
fallback development. Both modes mark a settlement `CONFIRMED` only after reading a real successful
Arc receipt and observing the expected `SettlementRecorded` contract event. The linked invoice is
marked `PAID` only after that real settlement confirmation.

## Backend responsibility

The backend manages orchestration state only:

- services
- payment plans
- checkout sessions
- usage events
- invoices
- settlements
- transaction references

## Excluded endpoints

Retempo v0.1 does not expose APIs for:

- balances
- payouts
- refunds
- disputes
- FX rates
- KYC

## Design decision

The API does not manage custody or user balances.

Settlement execution must remain tied to the Arc and Circle integration boundary.
