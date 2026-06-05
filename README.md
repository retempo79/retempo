# Retempo

Retempo is agentic recurring payments and usage-based USDC settlement infrastructure on Arc.

It provides a programmable settlement layer for developers, API providers, SaaS tools, and AI agents that need recurring subscriptions, pay-per-use billing, invoice state, and onchain settlement proof.

## Official links

| Resource | URL |
| --- | --- |
| Website | https://retempo.xyz |
| Documentation | https://docs.retempo.xyz |
| API | https://api.retempo.xyz |
| API health | https://api.retempo.xyz/health |
| API root | https://api.retempo.xyz/api/v1 |
| Repository | https://github.com/retempo79/retempo |

Production API health response:

```json
{
  "ok": true,
  "service": "Retempo",
  "apiRoot": "/api/v1"
}
```

## Product scope

Retempo v0.1 focuses on:

- developer-created services
- recurring and usage-based payment plans
- checkout sessions
- subscriptions
- usage event records
- invoices
- Arc settlement records
- transaction hash and settlement status tracking

Retempo v0.1 is not a lending protocol, FX product, prediction market, escrow, token vault, custodial balance system, payout system, refund system, dispute system, KYC system, tax system, or multichain product.

## Architecture

Retempo uses a hybrid architecture:

- PostgreSQL is the source of truth for operational state.
- Arc is the source of truth for settlement proof.
- Circle Developer Platform can be used as a transaction execution path.

```txt
User / AI Agent
     |
     v
Retempo Web App
     |
     v
Retempo API Backend
     |
     +--> PostgreSQL
     |
     +--> Circle Developer Platform
     |
     +--> Arc Testnet RPC
              |
              v
       RetempoSettlement contract
```

The backend handles orchestration state. The smart contract records settlement proof.

## Monorepo structure

```txt
retempo/
  apps/
    web/        # Next.js frontend
    api/        # Hono backend API
  contracts/    # Solidity / Foundry settlement registry
  packages/
    db/         # Prisma / PostgreSQL package
    shared/     # shared TypeScript constants
  docs/         # Mintlify documentation pages
```

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Node.js, TypeScript, Hono |
| Database | PostgreSQL, Prisma |
| Smart contract | Solidity, Foundry |
| Chain | Arc Testnet |
| Wallet / execution path | Circle Developer-Controlled Wallets, direct Arc execution mode |
| Package manager | pnpm |

## API

Base URL:

```txt
https://api.retempo.xyz
```

API root:

```txt
/api/v1
```

Core endpoints:

```txt
GET  /health

POST /api/v1/services
GET  /api/v1/services
GET  /api/v1/services/:serviceId

POST /api/v1/services/:serviceId/plans
GET  /api/v1/services/:serviceId/plans

POST /api/v1/checkout-sessions
GET  /api/v1/checkout-sessions/:checkoutSessionId

POST /api/v1/usage-events

POST /api/v1/invoices
GET  /api/v1/invoices/:invoiceId

POST /api/v1/settlements
GET  /api/v1/settlements/:settlementId
```

## Data model

Retempo v0.1 uses these core database models:

- `User`
- `Service`
- `PaymentPlan`
- `CheckoutSession`
- `Subscription`
- `UsageEvent`
- `Invoice`
- `Settlement`

The database stores operational state only. It does not store user balances.

## Settlement contract

The settlement contract is `RetempoSettlement`.

Its primary function is:

```txt
recordSettlement(...)
```

The contract emits:

```txt
SettlementRecorded
```

The contract is a settlement registry. It is not a billing engine, escrow contract, token vault, subscription manager, or payment processor.

## Local development

Install dependencies:

```bash
pnpm install
```

Start the API:

```bash
pnpm --filter @retempo/api dev
```

Start the web app:

```bash
pnpm --filter @retempo/web dev
```

Build all packages:

```bash
pnpm build
```

Typecheck all packages:

```bash
pnpm typecheck
```

## Environment

Create a root `.env` file.

Minimum local values:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/retempo"
NEXT_PUBLIC_RETEMPO_API_BASE_URL="http://localhost:8787"
WEB_ORIGIN="http://localhost:3000"
SETTLEMENT_EXECUTION_MODE="direct"
```

Arc values:

```bash
ARC_RPC_URL="https://rpc.testnet.arc.network"
ARC_CHAIN_ID="5042002"
ARC_DEPLOYER_PRIVATE_KEY=""
RETEMPO_OPERATOR_ADDRESS=""
RETEMPO_SETTLEMENT_CONTRACT_ADDRESS=""
ARC_TESTNET_RETEMPO_SETTLEMENT_ADDRESS=""
```

Circle values, required only for Circle execution mode:

```bash
CIRCLE_API_KEY=""
CIRCLE_ENTITY_SECRET=""
CIRCLE_WALLET_ID=""
```

Do not commit secrets.

## Frontend API configuration

The web app calls the backend API directly.

For local development:

```bash
NEXT_PUBLIC_RETEMPO_API_BASE_URL="http://localhost:8787"
```

For production:

```bash
NEXT_PUBLIC_RETEMPO_API_BASE_URL="https://api.retempo.xyz"
```

The main frontend flow does not use mock handlers, seeded demo records, fake paid states, or fake settlement confirmations. Checkout, invoice, and settlement states shown in the UI are returned by the backend/database.

## Documentation

Mintlify documentation is available at:

```txt
https://docs.retempo.xyz
```

The documentation source lives in `docs/` with root configuration in `docs.json`.

## Security boundary

Retempo v0.1 keeps settlement proof onchain and operational state offchain.

The current MVP intentionally excludes:

- pooled user balances
- custodial ledger accounting
- payouts
- refunds
- disputes
- tax handling
- KYC state
- FX rates
- autonomous marketplace logic

## License

Unknown / not documented.
