# CLAUDE.md — `dress-doctor-api`

Primary development guide for Claude Code working in the Dress Doctor **backend** repository. Read this first, every session. The full blueprint lives in `../dress-doctor-blueprint/` — this file is the operational contract.

---

## 1. Project overview

Dress Doctor is a laundry & garment-care business in Douala, Cameroon, moving off Google Sheets onto a real platform. This repo is the **single source of truth and the only holder of business logic**. It exposes a versioned REST API consumed by two separate frontend repos — `dress-doctor-admin` (internal staff+admin) and `dress-doctor-portal` (external customers+affiliates). Three repos total; **never** merge them.

Stack: **NestJS · MongoDB/Mongoose · CASL · JWT · BullMQ + Redis · WhatsApp Business Cloud API · Nodemailer + Handlebars · nestjs-i18n (fr default) · S3-compatible storage.**

This repo **evolves an existing codebase** — adopt its patterns (§3), don't re-architect.

## 2. Architecture principles

1. **One source of truth.** Orders/payments/customers live in one DB; flags are computed, never typed.
2. **Business rules live only in the service layer.** Controllers are thin; the frontend never re-implements a rule.
3. **Computed, not typed.** `paymentStatus`, `flagged`, `lastOrderAt`, `totalOrders`, `totalSpend`, reward eligibility — all system-maintained.
4. **Office-scoped by default.** Every operational collection carries `officeId`; queries auto-scope to the caller's office unless the role is `GLOBAL`.
5. **Configurable as data, not code.** Statuses, methods, roles, permissions, reward rules, settings are DB rows. Adding one is a data change, not a deploy.
6. **Slow/external work goes to the queue.** Requests never call WhatsApp/SMTP/report-gen inline.
7. **Auditable.** Mutating domain schemas use `attachHistoryHooks()`; every job writes a `job-run`.

## 3. Patterns to keep (from the existing repo — do NOT reinvent)

- One `User` + `UserType` identity; thin `Customer` 1:1 on top. Customer = OTP-only, staff = password + OTP (2FA). Same JWT/session layer.
- Configurable taxonomies via the generic `Util` module (not enums-as-truth).
- Database-driven CASL: `User→UserRole→Role`, `Role→RolePermission→Permission({action,subject})`, with `conditions` + `ScopeEnum(OFFICE|GLOBAL)`.
- Global `@Global() SchemaModule`; **`schema/` never imports from `api/`.**
- `attachHistoryHooks()` for audit — extend to new schemas, don't build a separate central log.
- `Office`/`OfficeType(FACTORY|OFFICE)`/`OfficeUser` as the branch model + signed office-link attribution (`GET /o/:slug?sig=`).
- Global API-key/secret gate + `request.data` context.
- Response/error envelope + `PaginationDto`.
- BullMQ producer/processor split with global retry/backoff + stage logging.
- Normalized order items against a shared `Item` catalog.

## 4. Correct these mismatches from the older greenfield doc

- Say **"Office," not "Branch,"** everywhere.
- Identity is **one `User` table** (not "two identity domains"). Customer=OTP; staff=password+OTP.
- Baseline roles are the **real seeded ones** (Manager, Co-Founder, Office Manager, Factory Manager); add Cashier/Driver/Laundry Staff/Customer Service/Treasurer/Secretary as **data**.
- Permissions are the normalized CASL schema, not an embedded rules array.

## 5. Gaps to close (priority order)

1. Implement the **WhatsApp send path** in `NotificationService` (only `EMAIL` worked); **fix the bug** routing WhatsApp OTP to `email` instead of `whatsappPhone`.
2. Add **`condition` + `colour` to `OrderItem`**; relax the unique `(orderId,itemId)` index to per-garment rows.
3. Enrich `PromoCode`: `perCustomerLimit`, `minOrderValue`, `applicableServiceTypeIds`, `stackable`.
4. Replace `Referral.rewardAmount` with an issued `PromoCode` + `PromoCodeUsage`.
5. Seed operational roles + (optionally) granular `OrderStatus` stages.
6. ~~Decide `google-auth-library`/`googleapis` fate~~ — **done**: removed. The price list lives in `src/static/item.data.ts` (242 rows, the sheet as it stood 2026-08-12), so a seed run needs no Google credentials and a price change arrives as a reviewed commit. Item uniqueness moved from `itemName` to `displayName` (same garment, different filing, different price); `npm run migrate:item-label` swaps the index on an existing database.
7. De-dup API key/secret re-verification between `LogRequestMiddleware` and `ApiClientGuard`.
8. **Real tests for `order.service.ts` and `payment.service.ts` first.**

## 6. Folder conventions

Layered by concern, then feature. `api/<feature>/` holds `*.module.ts`, `*.controller.ts` (HTTP only), `*.service.ts` (all logic), `dto/`, `*.events.ts`, `*.service.spec.ts`. Models live only in `schema/<domain>/`. Cross-cutting infra in `helper/` (casl, guard, decorator, pipe, interceptor, exception-filters, middleware, service). Queues in `queue/producers` + `queue/processors`. Cron in `scheduler/`. Events in `events/`. Migrations/seeds in `migrations/`. See `../backend/01-backend-architecture.md` §2 for the full tree.

## 7. Coding standards

- TypeScript **strict**; no `any` (use generics/unknown + narrowing). No non-null `!` on unchecked values.
- Controllers do routing, guards, swagger, DTO binding — **nothing else**. Logic goes in services.
- Inject models via `@InjectModel`; extract a `*.repository.ts` only when queries are reused/complex.
- Authorize with `@CheckPolicies` + `PoliciesGuard` reading the CASL ability — **never** `if (role === 'x')`.
- Throw typed `HttpException` subclasses with a stable machine `code`; let the global filter format the envelope.
- Emit domain events for side effects; keep the write path lean.
- Async/await only; no floating promises (lint-enforced). Wrap multi-doc money writes in transactions.
- Every public service method has a return type; DTOs are `class-validator` classes with `whitelist` + `forbidNonWhitelisted`.

## 8. API conventions

- Base `/v1`; plural resources; nest one level max; non-CRUD actions as sub-path verbs (`POST /orders/:id/transitions`).
- **Order status moves go through `POST /orders/:orderId/transitions` only.** The caller names a `target`; the server classifies the move against one `ORDER_WORKFLOW` map (`next` = normal progress, `previous` = a one-step correction of a status recorded in error) and derives cancellability (anything but `DELIVERED`/`CANCELLED`) — never duplicate the cancel rule per status. A client cannot declare the *kind* of move, so a correction can't be passed off as progress. Kinds are audited apart (`CORRECT`, `CANCEL`), and leaving CONFIRMED-or-later releases what confirming reserved (subscription quota + promo use) so nothing is double-spent. `GET /orders/:orderCode` publishes `availableTransitions`, so no frontend keeps its own copy of the rules.
- Always return the success envelope; always paginate lists (`page`, `size≤100`, `sort=field:dir`).
- Headers: `x-api-key`+`x-api-secret` (platform), `Bearer` (user), `Accept-Language`, `x-idempotency-key` (money/messaging).
- Keep Swagger accurate — it's the frontend's contract.

## 9. Database conventions

- `BaseSchema` everywhere (`isActive`, `createdBy`, `updatedBy`, timestamps). Soft-delete via `isActive`.
- **`officeId` on every operational collection**; customers are not office-owned.
- **Money = integer XAF**, never floats; carry `currencyId`.
- Human-readable codes via `CodeGeneratorService` (`OR-`, `CU-`, `PU-`), office-scoped sequences where noted.
- Declare indexes on the schema for every list filter/sort path (see database doc). Audited schemas get `attachHistoryHooks()`.
- Enum-like fields reference lookup collections by id; seed the named values.
- **Every mutating request carries an `x-change-reason` header (3–500 chars) and every audited write records it.** `ChangeReasonGuard` rejects a POST/PATCH/PUT/DELETE without one (400 `CHANGE_REASON_REQUIRED`); `ApiClientGuard` puts it on `request.data.reason`. Never hand-roll `{ changedBy }` again — build the context with `auditContext(this.req, userId)` (or `applyAuditLocals(doc, this.req, userId)` before a `save()`, `systemAuditContext(id, 'why')` for seeds/cron), so the reason reaches the trail. Exempt only what has no human intent: `@SkipChangeReason()` on auth/OTP, webhooks, api-client bootstrap and the read-shaped `POST /pricing/quote`.
- **A history row only says what changed if the write went through `findOneAndUpdate` with `{ context: { changedBy } }`.** That is the only path that diffs previous vs `$set` into `changedFields`. A `save()` writes `action: CREATE` with an empty `changedFields`, so it lands on a timeline as a bare marker with nothing in it — fine for an actual creation, useless for an edit. Mutate audited schemas through `findOneAndUpdate` + context; reserve `save()` for creates (and set `doc.$locals.changedBy` so the entry is still attributed).
- History joins the caller's transaction: pass `{ session }` on transactional writes and the hook reads the previous state and writes the audit row inside that session — so a rollback takes the entry with it, and a create-then-update in one transaction is logged as CREATE + UPDATE, not two creates.
- Read history back through `HistoryLabelService.labelChanges(SourceModel.name, entries)` (global, no wiring): it turns the foreign keys in a trail into names (`orderStatusId: … → …` becomes `CONFIRMED → RECEIVED`) off the schema's own `ref`s, so no per-table mapping or query. Raw ids stay beside the labels; never return the stored `snapshot` to a client.

## 10. Queues, events, notifications

- Producers are thin typed enqueue wrappers (the only thing services call); processors do the work. Configure retry/backoff once; log SUBMITTED→PROCESSING→COMPLETED/FAILED.
- Cron **enqueues**, processors execute. One cron owner via a Redis lock; fan out via the queue.
- All notifications go through the `notification` queue → delivery log. WhatsApp business-initiated sends use approved templates. i18n every message.
- Idempotent jobs where a duplicate would double-charge/double-message.

## 11. Testing requirements

- **Priority: real unit tests for `order.service` and `payment.service`** (pricing + payment-status logic). Mock models.
- Integration tests against ephemeral Mongo for query/index correctness; e2e (Supertest) for auth flows, order→payment→flag, webhook idempotency, guard ordering.
- Assert the envelope + pagination contract via shared helpers. CI fails under coverage threshold on order/payment services.
- Never mark a task done with failing/partial tests.

## 12. Security requirements

- Three gates, in order: platform key/secret → JWT → CASL policy. Office scoping enforced server-side; never trust a client `officeId` for non-global users.
- Hash passwords/refresh/OTP at rest; short-lived access tokens; rotate + revoke refresh. Rate-limit auth/OTP.
- Verify webhook signatures; expire office-link HMACs. Validate all input (whitelist DTOs); no raw client Mongo queries.
- **Never log** secrets, OTPs, tokens, or full account numbers. Secrets from a secret manager; `.env` never committed. CORS locked to frontend origins; helmet + HTTPS.

## 13. Performance expectations

- No unbounded queries; paginate + index every list path. Serve dashboards from cached rollups/snapshots, not live scans.
- Maintain `totalOrders`/`totalSpend`/`amountPaid`/`balance`/`lastOrderAt` incrementally. Cache CASL ability rebuilds in Redis (invalidate on role change).
- Stateless API (horizontal scale); worker runs processors + cron separately.

## 14. Git workflow

- Trunk-based; short-lived branches `feat/…`, `fix/…`, `chore/…`. Conventional Commits.
- PRs require green CI (typecheck, lint, tests, build, coverage gate) + review. `main` always deployable.
- One image, two entrypoints (`api`, `worker`). Seeds/migrations run as explicit, idempotent, re-runnable steps — never implicitly on boot.
- **History from the Google Sheet comes in through `npm run migrate:sales`**, not the seed. It takes the four tabs as CSV paths (`--customers --orders --items --payments`) plus a staff roster (`--staff`), and writes nothing until `--commit` — the dry run resolves everything and prints what did not resolve, and it predicts the committing run row for row. Imported rows carry the sheet's code in `legacyCode` (a payment's is `<order>:<date>:<amount>`), which is what makes a second run a no-op. The CSVs hold real customer data and staff passwords: they live in the git-ignored `data/`, and the roster is deleted once the run is done. Money is recomputed from the payments that landed rather than copied from the sheet's own columns, so an order the sheet records as paid a different amount is reported, not obeyed.
- Seeding is `npm run seed` (`npm run seed:prod` against a built image). It takes a Redis leader lock, so two deploys landing together cannot seed side by side. It creates what is missing and writes nothing at all to a row that needs nothing — a name, description, price or active/inactive somebody set from the panel is theirs, and the seed never puts its own value back. `SEED_RECONCILE_PERMISSIONS=YES` makes the seed's role map authoritative; leave it off wherever people edit roles in the panel.

## 15. Naming conventions

- Files `kebab-case.*.ts` (`order.service.ts`). Classes `PascalCase`; the class suffix matches the file role (`OrderService`, `OrderController`, `CreateOrderDto`). Mongoose schemas `PascalCase` singular (`Order`); collections plural. Enums `PascalCase` + `Enum` suffix for reference values. Event names `resource.verb` (`order.paid`). Queue names `kebab-case` (`inactivity-scan`). Error codes `SCREAMING_SNAKE_CASE`.

## 16. Do / Don't

**Do**
- Put every business rule in a service; compute flags; scope by office; go through the queue for external calls; extend `attachHistoryHooks`; keep Swagger current; write real order/payment tests.

**Don't**
- **Hardcode a status-transition table anywhere but `ORDER_WORKFLOW`** (frontends included — read `availableTransitions` off the order); mutate without a reason on the request; call it "branch"; split staff/customers into two identity tables; hardcode statuses/roles as the runtime source of truth; re-check permissions with `if (role)`; call WhatsApp/SMTP inline in a request; store money as float; log secrets/OTPs; return unpaginated lists; import from `api/` inside `schema/`; **edit an audited schema with `save()` or an update that carries no `changedBy` context — the history row comes out empty**; leave `order.service`/`payment.service` untested.
