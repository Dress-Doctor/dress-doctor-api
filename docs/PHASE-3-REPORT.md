# PHASE-3-REPORT — Customer experience (rewards, subscriptions, portal endpoints)

Phase 3 of `dress-doctor-api` per `../dress-doctor-blueprint/backend/BUILD-PHASE-3.md`. All work landed on `dev-raymond` as small, verifiable commits.

| Commit | Scope |
| :-- | :-- |
| `232372d` | §0 — OTP-login-over-HTTP e2e (pre-portal gate) |
| `d00f4c1` | §0 — route-name reconciliation, frozen contract (breaking rename) |
| `260be43` | §2.1 — rewards/loyalty engine |
| `4270c63` | §2.2 — subscription module + PER_UNIT pieces overage |
| `9cf00d3` | §2.3 — customer self-scoped endpoints + booking guard |

---

## 0. Pre-portal gate

### OTP-login-over-HTTP e2e (`test/auth-login.e2e-spec.ts`)
Customer OTP-only login and staff 2FA (password checked **before** any OTP is issued), proven over HTTP against the booted app (real Redis + replica-set Mongo). Also covers: channel-correct addressing (WhatsApp OTP → `whatsappPhone` — the Phase-2 fix), single-use codes, wrong-code 401, refresh-token rotation, unknown-phone 401.

**Deviation:** the brief suggested reading the issued code from the OTP collection; codes are bcrypt-hashed at rest, so the test hook captures the plaintext at the notification-enqueue boundary (`NotificationService.addToQueue` spy) instead — which additionally asserts the recipient address.

### Route contract reconciliation (before → after)
Convention picked: **plural resource prefixes, verb sub-paths, nested money writes.** Repo, Swagger and `03-api-specification.md` now agree; the doc carries a frozen-contract note (any future rename = `/v2`).

| Surface | Was (repo) | Frozen contract |
| :-- | :-- | :-- |
| Orders | `/order` | `/orders` (repo renamed) |
| Users | `/user`, `POST /user/new-user` | `/users`, `POST /users` (repo renamed) |
| Pickups | `/pickup`, `POST /pickup/schedule` | `/pickups`, `POST /pickups` (repo renamed) |
| Payments | `GET /payment`, `POST /order/:id/payment` | `GET /payments`, `POST /orders/:orderId/payments` (repo renamed) |
| Auth | `/auth/initiate-login`, `/auth/complete-login` | kept — **doc updated** (was `/login/initiate` + `challengeId`) |
| Transitions | verb sub-paths (`/confirm`, `/ready`, …) | kept — **doc updated** (generic `/transitions` never existed) |
| Apply promo | `PATCH /orders/:id { promoCode }` | kept — doc's `/apply-promo` removed |
| Catalog/taxonomy | `/reference/*` | kept — doc's `/catalog` + `/util` corrected |
| Refunds | REFUND `paymentTypeId` on the payment route | kept — doc's `/payments/:id/refund` removed |
| List envelope | `{ total, data, nextPage }` at top level | kept — doc's `{ items, page, size… }` corrected |
| Deliveries | none (order `/delivered` verb) | flagged in doc as deferred |

**Breaking change:** old singular paths are gone (`refactor(api)!`). The API has no production clients; `dress-doctor-admin` must adopt the plural paths.

---

## 1. §2.1 Rewards & loyalty engine

- **Schemas** (`src/schema/reward/`): `reward-rule` + `reward-tier` (admin config as data, audited via `attachHistoryHooks`) and the append-only `reward-ledger` (signed points; EARN/REDEEM/ADJUST). `Customer` gains `rewardPoints` (cached `Σ ledger.points`, recomputed inside every ledger transaction — never `$inc`-guessed) and `rewardTierId`.
- **Accrual** is event-driven and queued: `order.paid` → listener → `reward-accrual` queue → processor. Idempotent per order, three layers deep: BullMQ jobId `reward-accrual-<orderId>`, an EARN-exists check, and a unique partial `(orderId, type)` index that turns a lost race into a swallowed E11000. The accrual transaction also maintains `totalOrders`/`totalSpend` (their §1 maintenance point — previously never written) and recomputes the tier.
- **Rules as data**: seeded `ACCRUAL { per: 100, points: 1 }` and `MILESTONE { everyNthOrder: 5, points: 500 }` (placeholder economics — a `PUT /rewards/rules` away from real ones). Tiers Standard/Silver/Gold seeded by lifetime spend.
- **Redemption** (`POST /rewards/redeem`): one transaction writes the REDEEM row, recomputes the cached balance from the ledger, and discounts a **DRAFT** order (`rewardDiscount`/`redeemedPoints` on `Order`; `reprice()` preserves them). Can't overdraw (balance check inside the txn), integer XAF via the `rewardPointValueXaf` setting, **one redemption per order** (same unique index).
- Reads: `GET /rewards/ledger` self-scoped via `{ customerId: '$self' }`; rules/tiers readable by customers, writable by staff.

**Deviations/notes**
- Milestone "free wash" is modelled as bonus points (data-configurable), not an issued PromoCode — coupon issuance is the Phase 4 referral mechanic.
- One EARN row per order carries the accrual+milestone breakdown in `meta` (a per-rule row would break the unique-index idempotency).
- Points already redeemed on an order that is later cancelled are **not** auto-refunded (staff can `ADJUST`) — deferred.

## 2. §2.2 Subscription module

- **Plan catalog** (`subscription-plan`, audited, seeded): Basic 20 000 → 40 pcs, Standard 40 000 → 100 pcs (+4 bedsheets +3 kg curtains), Premium 65 000 → 200 pcs (+8/+6) — the blueprint's reference tiers — plus KG variants (20/50/100 kg, **placeholder quotas**). `overagePolicy` enum (PER_UNIT), `rolloverPeriods` (1), `includedAllowances` as data.
- **Subscription** rows snapshot the plan (quotaType/quotaAmount/billingCycle/overagePolicy) so a later plan edit never rewrites a live period; audited. One live (ACTIVE/PAUSED) subscription per customer.
- **PER_UNIT pieces overage in the pricing engine**: for a PIECES subscription, per-unit catalog prices are expanded and sorted descending — the first `remainingQuota` (priciest) pieces are covered, the excess (cheapest remainder) is billed at standard catalog price. `quotaConsumed` is a pure snapshot; the decrement still happens exactly once, in the confirm transaction (`reprice()` stayed pure — proven by test).
- **Lifecycle**: subscribe (customers self-only) / pause / resume / cancel, status-guarded (409 on illegal moves). `renewPeriod()` implements **rollover-once**: consumption draws the carried-in rollover first, whatever rollover survives the period **expires**, and only unused base quota (capped at `quotaAmount × rolloverPeriods`) carries.
- **Rename**: `Order.quotaConsumedKg` → `quotaConsumed` (the unit is the plan's `quotaType` now). Pre-prod, no migration needed.

**Deviations/notes**
- `renewPeriod()` has no cron owner yet — invoicing + renewal scheduling are the Phase-5 `subscription-billing` job; the maths lands (and is unit-tested) now so the portal's quota view is correct from day one.
- Quarterly plans are a data add (plan rows), not seeded.
- `includedAllowances` are stored/served but not yet enforced by the pricing engine (needs per-category piece typing) — deferred, flagged.

## 3. §2.3 Customer self-service endpoints

- `GET /customers/:id/orders | rewards | referral | balance | subscription` + `PATCH /customers/:id` (contact, `whatsappPhone`, `preferredLanguage`, `pickupAddress`, `notificationsOptIn`). Every by-id view resolves the customer through the caller's READ scope first — the seeded `{ userId: '$self' }` condition makes any foreign id a plain 404.
- **Booking**: the Customer role now carries `CREATE/UPDATE Order { customerId: '$self' }` + OrderItem CRUD + the catalog/taxonomy reads the portal needs (`/pricing/quote`, `/reference/*`). A creation-time guard (`scopePermitsCustomer`, shared with subscription enrolment) rejects a spoofed body `customerId` with 404 **before any write**. Pricing stays server-authoritative; promo applies via the draft PATCH; points via `/rewards/redeem` (self-scoped).
- Confirm/transitions remain staff actions — a portal booking lands as a priced DRAFT.

## 4. Tests

All green locally: **196 unit** (33 suites) · **39 e2e** (7 suites, real Redis + replica-set Mongo) · lint 0 errors · build clean.

New in this phase:
- `auth-login.e2e-spec.ts` — 10 tests (§0).
- `reward-accrual.service.spec.ts` (9) + `reward.service.spec.ts` (8) — accrual maths/flooring, milestone ordinal, three idempotency layers, tier recompute, rollup maintenance, redeem transaction/overdraw/one-per-order/scope.
- `rewards.e2e-spec.ts` (4) — **order.paid → points through the real queue**, replay no-double-credit, transactional redeem over HTTP, overdraw 400.
- `pricing.service.spec.ts` +4 — pieces overage: priciest-covered-first, fits-quota free, zero-quota full catalog, snapshot-only.
- `subscription.service.spec.ts` (12) — plan snapshot, one-live-subscription, self-scope on create, lifecycle guards, rollover-once (carry, expiry of surviving rollover, cap, rolloverPeriods 0, period shift).
- `subscriptions.e2e-spec.ts` (4) — seeded catalog, enrol + 409 duplicate, **over-quota pieces order bills 500 XAF excess and decrements once at confirm** (re-confirm 409), lifecycle.
- `self-scope.e2e-spec.ts` (5) — with the REAL seeded Customer role: own views 200, all six cross-customer views 404, self-booking server-priced, spoofed booking 404, profile edit + cross-PATCH 404.

## 5. Deferrals (tracked, intentionally out of scope)

- Referral **program** conversion → issued PromoCode, leaderboard; affiliate program → Phase 4.
- `subscription-billing` cron (invoices, auto-renew, `renewPeriod` scheduling) + reward-liability analytics → Phase 5.
- Included-allowance enforcement in pricing; point refund on order cancel; quarterly plan rows — data/design follow-ups noted above.
- Blueprint dir is not a git repo — `03-api-specification.md` edits saved but unversioned.
