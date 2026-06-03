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
