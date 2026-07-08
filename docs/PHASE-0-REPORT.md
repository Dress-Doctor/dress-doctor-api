# Phase 0 Report — Foundations & Scaffolding

Evolve-in-place pass over `dress-doctor-api` per `phases/BUILD-PHASE-0.md`. Scope: foundations only — no Phase 1 business modules (auth flows, orders, payments, customers, pricing) were added or changed beyond what was needed to keep existing code compiling/passing under stricter settings.

## 1. Gap report (before → after)

| §4 item | Before | After |
| :-- | :-- | :-- |
| 4.1 Inventory & boot | Built and booted against local Mongo + Redis already | Confirmed; no changes needed |
| 4.2 Env validation | `@nestjs/config` global, no schema validation, no `.env.example` | Joi schema validates every env var actually read by the app at boot (fail-fast); `.env.example` added |
| 4.3 Data/infra wiring | Global `SchemaModule`, Mongo/Redis wired, `schema/` doesn't import `api/` — all already true | Added `BaseSchema` (isActive/createdBy/updatedBy) as the new shared pattern; not retrofitted onto the 51 existing schemas (see §3) |
| 4.4 HTTP contract | Envelope + error filter + `ValidationPipe` present, but `forbidNonWhitelisted` off and `PaginationDto` size capped at 20/required | `forbidNonWhitelisted: true`; `page`/`size` now optional with defaults (1/20), cap raised to 100 per spec |
| 4.5 Platform gate | `ApiClientGuard` already resolved office+language into `request.data`, `@Public()`/`@SkipApiKeyCheck()` present | Unchanged in behavior; internals de-duplicated (see 4.6) |
| 4.6 Observability | No correlation id, no `/health`/`/ready`, key/secret re-verified in two places | Correlation-id middleware + JSON logging added; `GET /health`/`GET /ready` added; `ApiClientLookupService` de-dups the key/secret check |
| 4.7 Background work | `notification` queue + processor existed; no worker entrypoint, no cron scaffold | `src/worker.ts` + `WorkerModule` added (no HTTP surface); `SchedulerModule` wires `ScheduleModule.forRoot()` with zero jobs |
| 4.8 Seeds | Idempotent seeder existed for taxonomies/4 baseline roles/1 permission/2 offices/1 api-client/catalog lookups; items only via full Sheets import behind `SEED_ITEMS=YES` | Added 9 operational/external roles, expanded to 66 CRUD-shaped permissions, added `RolePermission` mappings for every internal/staff role, added a 10-item representative catalog slice seeded unconditionally. Verified idempotent (two runs, identical counts) |
| 4.9 Containerization | None | `Dockerfile` (multi-stage, one image/two entrypoints) + `docker-compose.yml` (mongo, redis, api, worker) added and **verified end-to-end** — `docker compose up` brings up all 4 services, `/health` returns 200. Three real bugs found and fixed in the process (see §2 items 13–14) |
| 4.10 CI | Jest/ESLint/Prettier configured but **every spec suite failed to load** (0 runnable tests) | Fixed the test harness (see below); added `.github/workflows/ci.yml`: install → typecheck → lint → test(+coverage) → build |

## 2. What changed, by commit

1. `feat(config)` — Joi env-validation schema + refreshed `.env.example`.
2. `feat(http)` — `forbidNonWhitelisted`, `PaginationDto` defaults/cap.
3. `fix(test)` — **the test harness was completely broken**: Jest had no `moduleNameMapper` for the `src/*` path alias (every suite failed to even load), and every enum-typed `@Prop()` lacked an explicit `type:`, which `@nestjs/mongoose` accepts under `nest build` but rejects under `ts-jest`. On top of that every existing spec only registered the class under test with zero mocks for its injected models/services. Fixed all three; went from 0 runnable suites to 10 suites / 18 tests passing. No new test *coverage* was added — this only unblocks what already existed, which was scaffold-only per the blueprint.
4. `refactor(auth)` — `ApiClientLookupService` (60s cache) replaces the duplicate key/secret verification in `LogRequestMiddleware` and `ApiClientGuard`. `LogRequestMiddleware` no longer rejects requests itself (it previously threw a 403 for bad creds, inconsistent with the guard's 401) — `ApiClientGuard` is now the single authoritative gate.
5. `feat(schema)` — `BaseSchema`.
6. `feat(observability)` — correlation id + JSON logging (native `ConsoleLogger` `json: true`, not a custom logger — Nest 11 ships this).
7. `feat(health)` — `GET /health`, `GET /ready` (version-neutral, excluded from `/api` prefix, skip both auth gates).
8. `feat(worker)` — worker entrypoint + empty cron scaffold.
9. `feat(seed)` — role/permission/RolePermission expansion + representative item slice.
10. `feat(docker)` — Dockerfile + compose.
11. `ci` — GitHub Actions workflow.
12. `chore(ts)` — `strict: true`. Fallout was 10 `noImplicitAny` errors (bracket-indexed loosely-typed objects) + 3 lint errors (`catch (error)` now `unknown`), all fixed at the call site.
13. `fix(docker)` — `docker compose up` crash-looped the `api` container on two separate bugs, both real and pre-existing (not introduced by this pass): `I18nModule` loads translations from `${cwd}/src/i18n` at runtime (same pattern as the `.hbs` templates), so the runtime image now ships `src/i18n` alongside `src/static`; and `Office.qrCodeUrl` had a non-sparse unique index while both seeded offices carried `qrCodeUrl: ''`, so the second upsert hit `E11000` on every boot — added `sparse: true` and dropped the dead `qrCodeUrl: ''` placeholder from seed data (real QR generation is a later feature).
14. `fix(docker)` — the `api` service published `3000:3000` but the container's own `.env` (via `env_file:`) carried `PORT=4000`, so nothing listened on the published port. `docker-compose.yml` now pins `PORT: '3000'` in the `api` service's `environment:` block, same pattern as the existing `DATABASE_URL`/`REDIS_HOST`/`REDIS_PORT` container-specific overrides.

## 3. Deliberate deviations from the blueprint docs (adapt, don't replace)

Per the ground rules, where the repo already had a working pattern that differs from the architecture docs, the existing pattern was kept and the deviation is called out here rather than silently "fixed":

- **Base path stays `/api/v1`**, not the blueprint's `/v1`. Both frontend repos are already built against `/api/v1` in prod.
- **`CheckAccessGuard`/`@CheckAccess`** stay as named, not renamed to the blueprint's `PoliciesGuard`/`@CheckPolicies`. Same job, existing name.
- **Error envelope stays flat** (`{ success, statusCode, errorCode, error: string, timestamp }`), not the blueprint's nested `{ error: { code, details[] } }`.

**This last one needs a cross-repo decision before Phase 1 frontend work starts.** Both frontend blueprints are specced to read `error.code` for i18n-mapped error messages and `error.details[]` to place validation errors on individual form fields. The current flat shape can't feed that. Two ways to resolve it: evolve the envelope additively (keep `errorCode`/`error` for existing prod clients, add `error.details[]` + a real `code` alongside), or change the frontend spec to match the flat shape. Not a Phase 0 blocker — the flat shape satisfies every Phase 0 acceptance criterion (envelope applied globally, 500s masked, validation errors return field-level detail via `errorCode`) — but it will block Phase 1 frontend integration if left unresolved.

- **`BaseSchema` was not retrofitted** onto the 51 existing schema files. ~19 of them are lookup/history collections where `createdBy`/`updatedBy` don't apply (e.g. `*-history` audit collections, taxonomy lookups) — a blanket retrofit would have been wrong, not just risky. It's introduced as the pattern for new/touched schemas going forward.

## 4. Known gaps / unverified

- **Docker is verified.** No `docker` binary was available in the pass's original sandbox, so this was initially shipped unverified; the user then ran it for real on their own machine. Two crash-looping bugs surfaced and were fixed (i18n path, `qrCodeUrl` unique-index collision — §2 item 13), plus one port-mapping mismatch (§2 item 14). `docker compose up` now brings up mongo/redis/api/worker cleanly and `GET /health` returns 200.
- **CI has not run on GitHub** — the workflow is written and every step (`typecheck`, `lint:ci`, `test:cov`, `build`) was run locally in the same sequence CI will use, all green. The workflow itself hasn't executed in Actions yet (no PR opened as part of this pass).
- **RolePermission conditions are not seeded.** `RolePermission.conditions` (the Mongo-query-shaped office/self-scoping) stays `undefined` for every seeded row — scope is set (`OFFICE`/`GLOBAL`) but per-record conditions are Phase 1 CASL work.
- **Customer/Referrer/Affiliate roles have no permissions wired.** They're seeded as `Role` rows only; their self-scoped permission model belongs with the Phase 1 auth-flow work.

## 5. Explicitly out of scope (per §6, untouched)

WhatsApp send path + OTP-recipient bug, `OrderItem.condition`/`colour`, `PromoCode` enrichment (`perCustomerLimit`, `minOrderValue`, etc.), referral-as-coupon, granular order-pipeline statuses beyond the existing 7, full 250-item catalog import (still gated behind `SEED_ITEMS=YES`, unchanged), and real `order.service`/`payment.service` test coverage (Phase 0 only repaired the test *harness* — the specs still only assert `toBeDefined()`).

## 6. Acceptance criteria checklist

- [x] `npm run build` succeeds, strict TS, no errors
- [x] App boots (`api`) and connects to Mongo + Redis; `worker` entrypoint boots too
- [x] `GET /health` → 200; `GET /ready` → 200 when Mongo+Redis reachable (503 path implemented, not exercised against real downtime in this pass)
- [x] Request without `x-api-key`/`x-api-secret` → 401; valid pair populates `request.data`
- [x] Success responses wrapped in envelope; errors return error envelope with 500s masked; validation errors return field-level detail
- [x] Swagger UI serves the spec with both security schemes (pre-existing, unchanged)
- [x] Seed runner idempotent — verified via two consecutive runs, identical collection counts
- [x] `docker compose up` — verified on the user's machine after fixing 3 real bugs (i18n path, qrCodeUrl unique index, PORT mapping)
- [ ] CI passes on a PR — workflow written, local dry-run green, **not yet run in Actions**
- [x] This report
