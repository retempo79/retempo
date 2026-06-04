# Retempo Architecture v0.1

## Core architecture

Retempo uses a hybrid architecture:

- offchain orchestration
- onchain settlement proof

Operational state is stored in PostgreSQL. Settlement proof is recorded on Arc.

## Components

- apps/web: Next.js frontend
- apps/api: Hono backend API
- packages/db: PostgreSQL and Prisma
- packages/shared: shared TypeScript types
- contracts: RetempoSettlement contract
- docs: product and architecture documentation

## Circle integration

Circle is used for wallet operation and transaction execution paths.

The exact integration path must be validated against official Circle documentation during implementation.

## Arc integration

Arc is used for final settlement proof and transaction history.

MVP target network:

- Arc Testnet
- RPC: https://rpc.testnet.arc.network
- Chain ID: 5042002

For settlement creation, the backend supports two local execution modes. `SETTLEMENT_EXECUTION_MODE`
`circle` submits `RetempoSettlement.recordSettlement(...)` with Circle Developer-Controlled Wallets
and verifies the resulting onchain transaction hash against Arc RPC. `direct` keeps the local Arc
private-key path as the fallback development mode. The backend does not fabricate transaction
hashes, receipts, or confirmations.

## Design decision

Retempo v0.1 is an API-first settlement orchestration layer.

It is not a fully onchain subscription protocol.
It is not a custodial ledger.
It is not an escrow system.
