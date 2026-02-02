# Platform Fees Implementation Notes

This document captures the platform-fee implementation summary, Railway updates, the new billing flow, and the next instructions to follow.

## What Changed (High-Level)

- Subscription model removed and replaced with monthly platform fees.
- New platform-fee service handles invoice generation, charge attempts, delinquency, and fee events.
- Scheduler triggers platform-fee jobs (invoice generation, charge attempts, delinquency).
- Transaction service debits `platform_fee`, emits fee events, and blocks external transfers when delinquent.
- Account service no longer gates beneficiaries by subscription.
- UI replaces subscription screens with platform-fee status + invoice history and delinquency banner.
- Supabase migration added platform fee tables and removed subscription tables/enum.

Key code locations:

- Platform fee service: `transfa-backend/platform-fee-service`
- Scheduler updates: `transfa-backend/scheduler-service`
- Transaction service updates: `transfa-backend/transaction-service`
- UI updates: `src/screens/Settings/PlatformFeesScreen.tsx`, `src/screens/Home/HomeScreen.tsx`, `src/screens/Settings/ReceivingPreferencesScreen.tsx`
- Migration: `supabase/migrations/20251026000000_add_platform_fees.sql`

## Railway Updates

### Deploy New Service: platform-fee-service

- Build path: `transfa-backend/platform-fee-service/Dockerfile`
- Environment variables:
  - `DATABASE_URL`
  - `CLERK_JWKS_URL`
  - `TRANSACTION_SERVICE_URL`
  - `BUSINESS_TIMEZONE=Africa/Lagos`
  - `RABBITMQ_URL`
  - `INTERNAL_API_KEY` (shared with scheduler for internal endpoints)
  - `SERVER_PORT`

### Scheduler Service

Add or update:

- `PLATFORM_FEE_SERVICE_URL`
- `PLATFORM_FEE_INTERNAL_API_KEY`
- `PLATFORM_FEE_INVOICE_JOB_SCHEDULE` (default `5 0 1 * *`)
- `PLATFORM_FEE_CHARGE_JOB_SCHEDULE` (default `15 0 * * *`)
- `PLATFORM_FEE_DELINQ_JOB_SCHEDULE` (default `30 0 * * *`)
- `TZ=Africa/Lagos`

Remove old subscription settings:

- `SUBSCRIPTION_FEE_KOBO`
- `BILLING_JOB_SCHEDULE`
- `RESET_USAGE_JOB_SCHEDULE`

### Transaction Service

Ensure:

- `ADMIN_ACCOUNT_ID` points to the platform revenue Anchor account.

### Frontend Environment

- Set `EXPO_PUBLIC_PLATFORM_FEE_SERVICE_URL` to the new Railway URL.
- Remove `EXPO_PUBLIC_SUBSCRIPTION_SERVICE_URL`.

### Database

- Run `supabase/migrations/20251026000000_add_platform_fees.sql`, or use `supabase/CONSOLIDATED_SCHEMA.sql` for a fresh DB.
- Seed `platform_fee_config` for `personal` and `merchant` user types.

### Decommission Subscription Service

- Remove `subscription-service` deployment and envs from Railway.

## New Billing Flow

1. **End-of-month invoice generation**
   - Scheduler triggers invoice creation at 00:05 on the 1st (Africa/Lagos).
   - `platform_fee_invoices` created per user for the prior month.

2. **Charge attempts during grace period**
   - Attempts on days 0, 1, 3, 5, 7 after due date.
   - Auto-debit wallet via transaction-service.
   - Record attempts; success creates a `platform_fee` transaction and emits events.

3. **Delinquency**
   - After grace end, invoices marked `delinquent` and events emitted.
   - External outbound transfers blocked.
   - Inbound external transfers rerouted to wallet.

4. **Recovery**
   - Once the wallet has funds, next attempt succeeds.
   - Invoice flips to `paid`, external transfers resume.

## Next Instructions to Follow

1. Run the platform fee migration (or consolidated schema) and seed `platform_fee_config`.
2. Deploy `platform-fee-service` to Railway and set env vars.
3. Update scheduler env vars to point to platform-fee-service and remove subscription envs.
4. Update frontend envs to use `EXPO_PUBLIC_PLATFORM_FEE_SERVICE_URL`.
5. Decommission `subscription-service` deployment.
6. Smoke test:
   - Create invoices
   - Force insufficient funds (expect delinquency and routing changes)
   - Top up wallet and verify recovery
