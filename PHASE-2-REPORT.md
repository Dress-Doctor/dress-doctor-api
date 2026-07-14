# Phase 2 Report — Automation & Notifications

Delivered against `../dress-doctor-blueprint/backend/BUILD-PHASE-2.md`. Every §2 scope item shipped, in order, each as its own reviewable PR (dev-raymond → stage).

## Before → after

| Area | Before | After |
|---|---|---|
| WhatsApp | `NotificationService` delivered EMAIL only; OTP routed to `email` | Real WhatsApp Business Cloud API send path (approved templates), OTP over WhatsApp to `whatsappPhone` with email fallback, delivery log with provider message id, signature-verified idempotent status webhook (`POST /webhooks/whatsapp/status`) flipping rows to DELIVERED/READ/FAILED |
| Queues/cron | One `notification` queue; cron scaffolding with no jobs | `inactivity-scan` + `payment-reconcile` queues behind thin typed producers; cron on the worker only, single-owner via Redis leader lock (`SET NX PX` + compare-and-delete release); every run writes a `JobRun` (SUBMITTED→PROCESSING→COMPLETED/FAILED); exhausted retries land in a per-queue Redis failed set + counter |
| Computed flags | Synchronous only | `payment-reconcile` backstop every 15 min recomputing `paymentStatus`/`flagged` through the **same** `payment-status.util` functions the sync path uses — agreement by construction, idempotent, watermarked by last completed run |
| Inactivity (flagship) | Nothing | Nightly scan: 14+-day-inactive customers (setting) → one WhatsApp alert to CS with full context (name, phone, last order date/items/value, lifetime orders); `follow_up` row written **before** enqueue (cooldown 7d, setting) blocks re-alerts and makes mid-run retries idempotent; `POST /follow-ups/:id/resolve` clears the block; `GET /follow-ups` + follow-up status on `GET /customers/inactive` |
| Transactional messages | Nothing | Order READY/DELIVERED + payment receipts to the customer (opt-in, WhatsApp-first with email fallback, fr/en by preference), idempotent per (order,status)/(payment) via `dedupKey` = BullMQ jobId + unique sparse delivery-log index |
| Observability | `/health` + `/ready` | `GET /metrics`: queue depths/outcomes, failed-set sizes, cron last-run age + overdue flags, provider call/failure/latency counters, `alerts[]` |
| PII | Queue stage logs printed full variables (incl. OTP codes) + raw phones | Stage logs print variable **keys** + masked recipients only (`maskRecipients`/`variableKeys`) |

## Deviations / decisions

- **Never-ordered customers** are excluded from inactivity alerts (no last-order context for CS to act on); they still appear in `GET /customers/inactive`.
- **`CS_WHATSAPP_PHONE` unset** (dev): alerts are counted `skippedNoDestination` and logged; no cooldown row is written so real alerts aren't silenced later.
- **Refunds** don't trigger a receipt (staff-mediated flow).
- **Opt-in** field (`Customer.notificationsOptIn`, default true) was added in Phase 2 — the blueprint assumed Phase 1 had it; it didn't.
- **Cron overdue thresholds**: ~3 intervals (45 min reconcile, 26 h inactivity); a never-run cron isn't flagged on fresh deploys.
- **`followUpId` + `dedupKey`** were added to the delivery log so follow-up ↔ delivery ↔ webhook-status and transactional idempotency are DB-enforced joins, not conventions.

## What's tested (162 unit tests, 30 suites)

- **Leader lock**: two workers race one tick → exactly one owner; loser blocked until release; non-holder can't release.
- **Cron**: leader writes exactly one job-run + one enqueue; non-leader does nothing; reconcile watermark passed as `since`.
- **Runner**: PROCESSING→COMPLETED transitions with counts; pre-exhaustion failures retry silently; final attempt → FAILED + failed set.
- **Reconcile**: converged order untouched; drift corrected to exactly the sync answer (same util asserted); re-run no-op; missing orders skipped.
- **Inactivity**: cooldown trio (one alert / none within cooldown / re-alert after resolve); full-context payload; follow-up-before-enqueue ordering; no-destination skip; log sweep proves the raw phone never appears in logs.
- **Transactional**: dedup keys per (order,status)/(payment); duplicate event no-op; READY≠DELIVERED; opt-out/refund/non-target gating; WhatsApp-first channel fallback; `jobId=dedupKey`; dedupKey persisted.
- **Dispatch**: provider-mocked WhatsApp send + delivery-log write; OTP targets `whatsappPhone`; webhook updates the log (e2e).
- **Metrics**: healthy snapshot no alerts; failed-set growth, cron-overdue, provider-failure alerts fire; fresh-deploy cron not overdue; counter accumulation; metrics writes never fail a send.

## Not driven end-to-end

The live worker loop (cron → Redis lock → queue → processor) and a real WhatsApp API call need a running Redis/Mongo/WhatsApp stack; they're covered by unit tests with mocked providers and by the HTTP e2e suite for the webhook. Exercised when the compose stack is up / in a CI services job.

## Deferrals (per §4)

Rewards/loyalty (Phase 3), customer & affiliate portals (Phase 3+), referral/affiliate programs (Phase 4), analytics dashboards/reconciliation snapshots/exports (Phase 5), back office (Phase 6).
