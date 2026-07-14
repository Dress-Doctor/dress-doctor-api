# Phase 1 Report — Core Operations

Evolve-in-place delivery of Phase 1 per `../dress-doctor-blueprint/backend/BUILD-PHASE-1.md`:
auth, users/customers, offices, catalog/pricing, orders, payments, CASL scoping,
and the error-envelope migration — with real service tests and a coverage gate.
All Phase 0 patterns kept (one `User`+`UserType`, DB-driven CASL, global
`SchemaModule`, `attachHistoryHooks`, `Office`/`OfficeUser`, api-key gate +
`request.data`, envelope + `PaginationDto`, BullMQ split).

Base path is `/api/v1`; guards run api-key → JWT (`AuthGuard`) → CASL.

## 1. Gap report (before → after)

| Area | Before | After |
| :-- | :-- | :-- |
| Error envelope | flat `{ errorCode, error }` | nested `{ error: { code, details[] } }` globally (done first, commit `86b5ef3`) |
| Auth | access-only token (5d), OTP routed to email, OTP logged in plaintext, no refresh/logout/me | two-tier login on one identity; rotated+hashed refresh tokens (revocable); `refresh`/`logout`/`me`; OTP routed by channel (WhatsApp→`whatsappPhone`); OTP never logged; short-lived access token (`JWT_ACCESS_TTL`, 15m) |
| Customers | `Customer` = `userId`+`referralCode` only | enriched (customerCode `CU-`, pickupAddress, homeOfficeId, referredBy, rollups `lastOrderAt`/`totalOrders`/`totalSpend`, registeredAt); registration creates `User`+`Customer` + referral link; `GET /customers/inactive` |
| Staff | create + list only | full CRUD, role assignment (global `UserRole` / per-office `OfficeUser`), deactivate |
| Offices | signed office-link only | Office CRUD (GLOBAL) + office-users; office-link hardened (expiring HMAC, constant-time verify, env cookie domain/secure) |
| Pricing | client `unitPrice` with `item.priceLow` floor | server-authoritative pricing engine branched by model (Per Piece / Per KG / Subscription / Free); `/pricing/quote`; per-office price → company-wide fallback; new `Price` collection |
| Orders | per-method hardcoded transitions; ad-hoc totals | data-driven `LEGAL_TRANSITIONS` guard (`INVALID_STATUS_TRANSITION`); per-garment items (condition/colour); server-authoritative snapshot via the engine; computed `flagged`; `GET /order/flagged`; `order.created`/`status_changed`/`paid` events |
| Payments | non-idempotent, no txn, no flagged/OVERPAID | idempotent (`x-idempotency-key`, unique-sparse index); recompute `amountPaid`/`balance`/`paymentStatus`(+OVERPAID)/`flagged` in a transaction; `payment.recorded`/`order.paid`; refund path |
| CASL scoping | roles seeded without conditions | `RolePermission.conditions` seeded (office `{officeId:'$office'}`, self `{…:'$self'}`); resolved at ability-build; enforced by query filter on lists **and by-id paths** |
| Settings/Subscription | none | `Setting` collection (perKgRate/overageRate seeded 1000 XAF/kg); minimal `Subscription` |
| Tests | scaffold `toBeDefined()` only | 17 suites / 92 unit tests; coverage gate on order/payment/pricing |

## 2. Pricing model (§6-8, server-authoritative)

Price is computed server-side, never taken from the client. Branched by the
order's pricing model:

- **PER_PIECE** — `subtotal = Σ (catalog unitPrice(item, serviceType, office) × qty)`;
  per-office price wins, else company-wide (`officeId: null`); resolved prices
  snapshotted onto each line.
- **PER_KG** — `subtotal = totalWeightKg × perKgRate`; a missing weight is
  rejected (`WEIGHT_REQUIRED`) so it never silently prices to 0; garment lines
  kept for QC at unitPrice/lineTotal 0.
- **SUBSCRIPTION** — `subtotal = max(0, weight − remainingQuota) × overageRate`;
  no active sub → `NO_ACTIVE_SUBSCRIPTION`; quota decremented **once at confirm**.
- **FREE** — 0.

Discounts are two independent slots: `manualDiscount` (staff, permissioned) and
`promoDiscount` (engine). `totalAmount = max(0, subtotal − manualDiscount −
promoDiscount)`. Promo enforces window / maxUsage / **perCustomerLimit** /
minOrderValue / service-type applicability. Rates are data (`Setting`), not
constants. `/pricing/quote` runs the same engine without creating an order.

`reprice()` re-runs the engine on every draft mutation (item add/update/delete,
weight/manualDiscount/promo change) and is a **pure snapshot** — no side effects.
The one-time side effects (quota decrement, `PromoCodeUsage` + `usedCount`) run
at confirm only, made idempotent by the transition guard (a confirmed order
can't be re-confirmed).

## 3. Security

- **CASL scoping enforced, not just seeded.** `scopeFilter(ability, action,
  subject)` (via `@casl/ability/extra` `rulesToQuery`) yields a Mongo filter
  merged into queries — enforcement is by query, dodging the CASL/Mongoose
  ObjectId-sift trap. Applied to list endpoints **and every by-id path** (order
  read/mutate/transition, payment target-order lookup, customer detail). A
  non-global staff user cannot read or mutate another office's order by id, and
  a customer cannot fetch another's record — out-of-scope looks like 404.
  (This closed a cross-office IDOR found mid-phase, commit `a33fab7`.)
- Access token short-lived + config-driven; refresh tokens hashed at rest,
  rotated, revocable. OTP rate-limited, single-use, hashed, never logged.
- Money writes (payment record) run in a transaction; idempotent via
  `x-idempotency-key` backed by a unique-sparse index.

## 4. Tests & coverage

- 17 suites / 92 unit tests. Model-mocked service tests for the money/logic
  paths: pricing (all 4 models + discounts + per-customer limit), payment
  (partial/overpay/idempotency/flagged/status), order (guarded transitions +
  confirm finalize + flagged), auth (two-tier/OTP/refresh), customer, user,
  office, office-link, and the CASL `scopeFilter`.
- **Coverage gate** (jest `coverageThreshold`, run in CI via `test:cov`) floors
  payment.service (~73%), pricing.service (~66%), and order.service. order.service
  is at ~29% because its create/list/reprice paths are exercised end-to-end, not
  by unit tests — see §6; the gate is a regression floor, to be raised once the
  full HTTP e2e suite runs in CI.
- **Integration e2e** (`test/casl-scope.e2e-spec.ts`, `npm run test:e2e`) runs
  against a real single-node **replica-set** Mongo (mongodb-memory-server, self
  contained — no Redis): proves office-A staff can't fetch office B's order by id,
  CAN fetch their own, a global user is unrestricted, and multi-document
  transactions work on the replica set. This caught a real bug unit mocks
  couldn't: scope conditions carried string ids, which Mongoose won't cast inside
  `$or` (and aggregate `$match` never casts) — so scoped users were matching
  nothing (locked out of their own office). `scopeFilter` now deep-casts 24-hex
  id strings to ObjectId.

## 5. Deviations (adapt, don't replace)

- Routes stay `auth/initiate-login` + `auth/complete-login` (working, tested);
  the spec's `/login/initiate` naming was not adopted to avoid churn.
- JWT `office` carries the api-client office context; per-user office binding
  matures with `OfficeUser`.
- `customerCode`/`orderCode`/`officeCode` are random-unique (repo convention),
  not sequential.
- `DEFAULT_INACTIVE_DAYS = 14` constant until a settings-backed override; the
  `Setting` collection now exists and can host it.
- `Price`, `Setting`, `Subscription` are not audited via `*-history` hooks
  (prices are append-only rows — their own audit trail).
- Refund is gated by `manage Payment` (no `APPROVE` in the CASL action enum —
  stricter than a dedicated approve, acceptable).
- `OrderItem` has no `officeId`; item access is scoped through its parent Order,
  so it is deliberately excluded from the office-owned condition set.

## 6. Known gaps / must-do before this phase is production-ready

- **Mongo must run as a single-node replica set** (`--replSet rs0` +
  `rs.initiate()`) in dev/compose/prod. Multi-doc transactions (payment record,
  order confirm finalize) **throw on a standalone mongod**. Proven necessary and
  proven working by the integration e2e (§4), which runs its own in-memory
  replica set; the dev/compose Mongo (`DATABASE_URL`) must likewise be a replica
  set. Prod uses an external managed cluster (already a replica set).
- **HTTP e2e suite** — **done** (`test/http.e2e-spec.ts`): boots the real app
  against a real Redis (CI service container) + ephemeral replica-set Mongo,
  mirroring `main.ts`; asserts guard ordering (api-key → JWT), the error/success
  envelope, and pagination. Runs in CI via a dedicated `e2e` job. Extending it
  with the full order→payment→flag and OTP-login flows is straightforward
  follow-up now the harness exists.

## 7. Deferred (tracked, not blockers)

- **Refresh-token reuse detection** stored (`replacedByTokenHash`) but not
  enforced — a revoked-token replay should revoke the user's whole live chain.
- **PII in logs** — full phone numbers are logged at `.error` on routine
  rejections (auth/otp/customer). Mask and drop routine rejections to warn/debug.
- Enrichment of the referral program (promo-as-coupon), full 250-item catalog
  import (migration behind `SEED_ITEMS=YES`), and subscription-plan/billing are
  later phases.

## 8. Commits (on `dev-raymond`)

Auth (`4c60b75`, `d6189f3`, `4eb2b29`), customers (`ea49dee`, inactive,
`refactor` constant), staff (`f4b6309`), offices (`f590052`, `f8b3417`),
pricing engine (`e789a02`, `a8016cb`), orders (`0faf6d7`, `a3b89d8`, item-`_id`
fix `15a4621`), payments (`bd7864d`, `d852b4a`), CASL (`87e3453`), IDOR fix
(`a33fab7`). Full suite green + build + typecheck + lint after each.
