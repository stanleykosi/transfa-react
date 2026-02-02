# Platform Fee Model Implementation Plan

This document replaces the subscription model with a monthly platform-fee model. It removes all subscription logic and defines the new billing flow, data model, and routing rules so any engineer (or LLM) can implement it end-to-end.

## Goals

- Charge every user (personal + merchant) a monthly platform fee.
- Allow separate fee amounts per user type in the future.
- Auto-debit the user wallet at the end of each month.
- If unpaid, allow a grace period and then block external transfers.
- When blocked, route external inbound transfers to the Transfa wallet instead of external beneficiaries.
- Remove all subscription code paths, tables, and routing logic tied to subscriptions.

## Billing Policy (Standard Fintech Defaults)

- **Billing period**: calendar month.
- **Charge timing**: job runs at 00:05 on the first day of the next month, treating it as end-of-month billing.
- **Timezone**: Africa/Lagos (or your canonical business timezone). Store timestamps in UTC.
- **Grace period**: 7 days after the charge date.
- **Dunning attempts**: Day 0, 1, 3, 5, 7. Stop after grace end.
- **Status semantics**:
  - `pending`: invoice created, unpaid.
  - `paid`: fee collected.
  - `failed`: latest attempt failed, still within grace.
  - `delinquent`: grace ended and still unpaid.
  - `waived`: admin or system waived the fee.

## Data Model (Supabase)

Use the consolidated SQL file at `supabase/CONSOLIDATED_SCHEMA.sql`. It already includes platform fee tables and removes subscription tables.

### New Tables

1) `platform_fee_config`
- Stores fee values by `user_type` and effective date.
- Supports future fee divergence between personal vs merchant accounts.

2) `platform_fee_invoices`
- One invoice per user per month (`unique (user_id, period_start)`).
- Stores amount, due date, grace end, status, retries, and last failure reason.

3) `platform_fee_attempts`
- Audit log of each debit attempt against an invoice.

### Transaction Ledger
- Add `platform_fee` to `transaction_type` enum.
- Create a transaction record for each successful fee charge.

### Remove Subscription Objects
- Drop/avoid `subscriptions`, `monthly_transfer_usage`, and `subscription_status`.
- Remove any reference to `subscription_fee` in `transaction_type`.

## Service Architecture Changes

### 1) Remove Subscription Service
- Delete `subscription-service` or leave it unused but remove from routing and deployment.
- Remove any subscription environment variables.
- Remove API routes referencing subscription status or upgrades.

### 2) Introduce Platform Fee Service
Replace subscription-service responsibilities with a billing/fees service.

**Responsibilities**:
- Create monthly invoices for each user.
- Execute fee charge attempts (auto-debit).
- Update invoice state and write audit records.
- Provide fee status for routing logic and UI.

**Suggested internal endpoints**:
- `POST /internal/platform-fees/invoices/generate`
- `POST /internal/platform-fees/invoices/:id/charge`
- `GET /internal/platform-fees/users/:user_id/status`
- `GET /platform-fees/invoices` (user-facing, read-only)

### 3) Scheduler Service Jobs
Add or replace existing jobs with:

1) **Monthly invoice generation**
- Runs at month-end + 00:05.
- For each active user, create a `platform_fee_invoices` row.
- Uses `platform_fee_config` to select amount by `user_type`.
- Idempotent by `unique (user_id, period_start)`.

2) **Charge attempts job**
- Runs multiple times during grace period.
- Attempts to debit the primary wallet balance.
- On success: mark invoice `paid`, write `platform_fee` transaction, emit event.
- On failure: write `platform_fee_attempts`, increment retry_count, update `failure_reason`.

3) **Delinquency escalation**
- Runs daily after grace period end.
- Marks invoices `delinquent` if unpaid.
- Emits `platform_fee.delinquent` event.

### 4) Transaction Service
- Add a `platform_fee` transaction creation path.
- Debit user wallet, credit platform revenue account.
- Ensure idempotency with invoice ID.

### 5) Notification Service
- Add events for:
  - `platform_fee.due`
  - `platform_fee.failed`
  - `platform_fee.paid`
  - `platform_fee.delinquent`
- Notify users via push/email and show banner in app.

## Routing Logic (Remove Subscription Gating)

### Remove
- Any check of subscription status or monthly transfer usage.
- Any subscription-based routing or gating.

### New Effective Receiving Preference
When handling external transfers, compute an effective preference:

- If `platform_fee` is **paid or within grace**, use the stored `user_receiving_preferences`.
- If **delinquent**, override to **internal wallet**.

This ensures:
- External transfers are blocked after grace.
- Incoming funds still land in the wallet, enabling auto-debit.

### Outbound External Transfers
- If `platform_fee` is delinquent, block outbound external transfers with a clear error.
- Internal transfers and wallet credits are still allowed.

## Billing Flow (Step-by-Step)

1) **End of month job**
- Create invoice for each user for the previous month.
- Set `due_at` and `grace_until`.

2) **Charge attempt**
- Check wallet balance.
- If sufficient, debit wallet and mark invoice paid.
- If insufficient, record failed attempt and schedule next attempt.

3) **Grace period**
- Continue attempts through grace end.
- Notify user after each failure.

4) **Delinquency**
- When grace ends and unpaid: set `delinquent`.
- Block external transfers and override routing.

5) **Recovery**
- When balance is topped up, next attempt succeeds.
- Invoice flips to `paid`, external transfers resume.

## Security & RLS

- RLS enabled on all fee tables.
- Users can read only their own invoices and attempts.
- Config table is service-role only.

## Migration / Cutover

1) Create a new Supabase project.
2) Run `supabase/CONSOLIDATED_SCHEMA.sql` in the SQL editor.
3) Remove subscription service from deployment.
4) Deploy the new platform-fee service and scheduler jobs.
5) Point the app to the new Supabase DB.

## Removal Checklist (No Subscription Trace)

- Remove subscription-related env vars.
- Remove subscription endpoints and UI screens.
- Remove subscription tables and enums from schema.
- Replace subscription gating with platform fee status checks.

## Testing Checklist

- Invoice creation is idempotent per user/month.
- Auto-debit succeeds with sufficient balance.
- Failed debits create attempt records and retry.
- After grace end, external transfers are blocked and inbound routing switches to wallet.
- After payment, external transfers resume.

## Observability

- Metrics: invoices created, paid rate, failure rate, delinquent count.
- Alerts: spike in failed attempts, high delinquent percentage, charge job failure.
- Logs: invoice ID, user ID, attempt result, transfer ID.
