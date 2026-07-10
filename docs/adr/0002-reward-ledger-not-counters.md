# ADR-0002: Append-only reward ledger, derived balances

Status: Accepted · Date: 2026-07-07 · Phase 6 §3.3

## Decision
XP/coins are an append-only event stream (`reward_events`) with
trigger/function-maintained `reward_balances`. All mutations flow through
`award()` (SECURITY DEFINER); clients hold zero write policies on either table.

## Consequences
+ Auditability, anti-cheat forensics, offline idempotency via
  client_event_id, nightly reconciliation possible.
- Slightly more plumbing than a counter column; hot-row updates on balances
  (acceptable; partitioning plan documented for the ledger).
