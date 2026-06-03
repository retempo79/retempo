# Retempo

Retempo is an agentic recurring payments and usage-based USDC settlement infrastructure project on Arc.

## Product direction

Retempo enables developers, API providers, SaaS tools, and AI agents to create payment agreements for recurring subscriptions, usage-based API billing, and agent-to-service payments.

## Architecture

Retempo v0.1 uses a hybrid architecture:

- offchain orchestration for services, plans, invoices, usage events, and dashboard state
- onchain settlement proof on Arc
- Circle Developer Platform for wallet and transaction execution paths

## Monorepo structure

apps/web        Next.js frontend
apps/api        Hono backend API
contracts       Solidity / Foundry contracts
packages/db     Prisma / PostgreSQL package
packages/shared Shared TypeScript types and constants
docs            Product and architecture documentation

## Status

Initial repository setup.
