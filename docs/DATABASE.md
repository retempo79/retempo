# Retempo Database Model v0.1

## Source of truth

PostgreSQL is the source of truth for operational state.

Arc is the source of truth for settlement proof.

## Core tables

- users
- services
- payment_plans
- checkout_sessions
- subscriptions
- usage_events
- invoices
- settlements

## Relationship model

users own services.

services have payment plans.

payment plans create checkout sessions, subscriptions, and invoices.

subscriptions can produce usage events.

invoices can produce settlements.

## MVP rule

Retempo does not store user balances in the database.

The database stores operational records only:

- service metadata
- pricing plans
- usage records
- invoice state
- settlement references
- transaction hashes

## Migration command

Run the Prisma migration baseline against a real local PostgreSQL database:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/retempo" pnpm --filter @retempo/db db:migrate
```

Validate the schema before migration with:

```bash
pnpm --filter @retempo/db db:validate
```

## Excluded from MVP

- balances
- payouts
- refunds
- disputes
- taxes
- KYC status
- FX rates
