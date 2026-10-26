# 02 — Technical Requirements Document (TRD)

Companion to [ARCHITECTURE.md](ARCHITECTURE.md) (the "why") and [DEPLOYMENT.md](DEPLOYMENT.md) / [GO-LIVE.md](GO-LIVE.md) (operations). This file is the at-a-glance technical contract.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.12** (App Router) + **React 19.2.4** + TypeScript 5 | Single deployable. Mutations via Server Actions; Route Handlers only where a real HTTP response is needed (file downloads, reference lists, exports). |
| Styling | **Tailwind CSS v4** (`@theme` tokens in `src/app/globals.css`) + CSS custom properties | Design tokens in one file; no gradients per brand. Radix UI (accordion, dialog), CVA, `tailwind-merge`, `lucide-react`, GSAP for motion. |
| Validation | **Zod 4** + react-hook-form | The same schema runs in the browser and on the server (`src/lib/validation/*`). |
| Database | **PostgreSQL** + **Prisma 7** (`@prisma/adapter-pg`, `pg`) | Client generated to `src/generated/prisma`. Schema: `prisma/schema.prisma`; migrations in `prisma/migrations`. |
| Auth | Session cookies + **scrypt** password hashing (`node:crypto`, N=2^15, r=8, p=1) | No native build step. Opaque 256-bit tokens; only SHA-256 digests stored (`Session.tokenHash`), so a DB disclosure cannot be replayed. Revocable server-side sessions. |
| Authorisation | RBAC table in `src/lib/auth/rbac.ts` (7 roles → explicit permissions) + `AdminPermissionGrant` per-user overrides + department scoping (`UserDepartmentScope`) | Scope is folded into SQL `WHERE` by `buildWhere()`, never post-filtered. |
| Files | Local disk in dev, **S3-compatible** in production (`@aws-sdk/client-s3`) | Private by default; served through an authorising route (`/api/files/[id]`). Uploads validated against actual bytes; `sharp` for image processing. |
| Email | **Nodemailer**; writes `.eml` to `storage/mail` when SMTP is unset | Real messages inspectable without sending. |
| Exports / import | `exceljs` (Excel), CSV; `papaparse` for the legacy CSV import | |
| Rate limiting | Database-backed fixed window (`RateLimitBucket`) | No Redis dependency. |
| Job queue | Database-backed (`ImportJob`, `SELECT … FOR UPDATE SKIP LOCKED`) | Deliberate decision not to add Redis for a few thousand rows. |
| Tests | **Vitest** (unit/integration, jsdom, Testing Library) + **Playwright** (desktop/mobile/tablet) + **axe-core** | See [TESTING.md](TESTING.md). |
| Deploy | **Docker Compose** on a single VPS (app + `db` Postgres service + one-shot `migrate` service), image built in CI; alternatives documented (Vercel, systemd) | `docker-compose.yml`, `docker-compose.proxy.yml`, multi-stage `Dockerfile`. |

Laravel was evaluated and rejected: a second runtime would double the deployment and auth surface, and shared Zod schemas remove client/server validation drift (see [README.md](../README.md)).

## 2. Application structure

```
src/
  app/            App Router: (auth) (volunteer) (admin) (site) (legal) + api/ route handlers
  components/     ui primitives, apply/ wizard, admin/, site/
  lib/            db, env, auth+rbac, questions engine, validation, files, audit, settings, security
  config/         site.ts (event facts from env), features.ts (launch flags)
  content/        static page content (homepage, about, contact, navigation, dashboard copy)
  generated/prisma  generated Prisma client (committed path, regenerated on install)
prisma/           schema.prisma, migrations/, seed.ts, seed-data/
docker/, scripts/, tests/ (unit, integration, e2e), storage/ (dev files + mail)
```

The dynamic **question engine** (`src/lib/questions/engine.ts`) is isomorphic and dependency-free: visibility (`isQuestionVisible`/`visibleQuestions`), pruning (`pruneHiddenAnswers`), validation (`validateAnswers`) and rendering (`formatAnswer`) are one implementation used by browser and server. See [ARCHITECTURE.md §3](ARCHITECTURE.md).

## 3. Configuration and environment

All environment variables are documented in `.env.example` and [SETUP.md](SETUP.md). Key groups:

- `DATABASE_URL`, `APP_SECRET` — required.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — bootstrap super administrator (default must be changed).
- `NEXT_PUBLIC_EVENT_*` — edition facts (duration, edition, start/end, venue, theme, nations). Single source of truth is `src/config/site.ts`; a unit test keeps duration and edition in step. Until `NEXT_PUBLIC_EVENT_STARTS_AT` is set, the homepage says "dates to be announced" and omits Event structured data.
- `NEXT_PUBLIC_FEATURE_*` — launch flags (`src/config/features.ts`). Registration, admin and legal pages are always on; Give/Blog/Gallery/Magazine/Radio/Prayer Request default off.
- SMTP and S3 credentials — optional in dev (falls back to `storage/mail` and local disk).

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so Docker builds must pass them as build args (`--env-file .env.production` is mandatory — see the header comment of `docker-compose.yml`).

## 4. Security requirements (implemented)

- CSRF: Server Actions are origin-protected by Next.js; Route Handlers carry an explicit check (`src/lib/security/csrf.ts`).
- Login lockout fields (`failedLogins`, `lockedUntil`) and DB-backed rate limiting.
- Health information isolated in `application_health_info`; readable only via `revealHealthInfoAction` behind `health:view`; excluded from exports and emails; every access audited (`health.viewed`).
- Upload validation against actual bytes; storage keys are opaque and never exposed; files served through an authorising route.
- Password change revokes all sessions; scrypt parameters embedded in the hash for future upgrades.
- Full audit trail (`AuditLog`) plus `RoleAssignmentHistory` for access changes; migration files containing personal data live under private storage keys and are deleted on a retention schedule (`MigrationBatch.fileDeletedAt`).
- Self-protection in admin: cannot change own permissions, suspend self, or remove the last usable super administrator.

## 5. Non-functional requirements

| Area | Requirement | How it is met |
|---|---|---|
| Accessibility | WCAG 2.1 AA | axe-core in E2E; AA-compliant interactive palette (`#D63A02`, 4.70:1) asserted in `tests/unit/contrast.test.ts`; accessible reordering controls; 320–1920 px checks. |
| Performance | Filterable/reportable fields are typed, indexed columns; only department questions are EAV | Central data-modelling decision, [ARCHITECTURE.md §2](ARCHITECTURE.md). |
| Reliability | Migrations applied by a one-shot container before the app starts; imports idempotent (checksum + `(batchId, rowNumber)` uniqueness); queue jobs retried up to `maxAttempts`. |
| Resumability | Wizard drafts autosaved server-side (`draftData`), survive device changes. |
| Observability | Audit log, announcement delivery statistics, import batch counters; monitoring/backup recipes in [DEPLOYMENT.md](DEPLOYMENT.md) (nightly `pg_dump`, keep 30 days). |
| Privacy | Health data isolation; testimony/contact PII behind dedicated permissions; deletion requests recorded (`User.deletionRequestedAt`). |
| Quality gate | `npm run verify` = typecheck → lint → tests → build; E2E across desktop/mobile/tablet projects (`playwright.config.ts`). |

## 6. Constraints

- **Single VPS** production target with Postgres co-located (decision 2026-08-05); no Redis, no external queue.
- **Brand constraints**: no gradients; one CTA orange; uppercase Afacad display type (see [04-UI-UX-Design-Brief.md](04-UI-UX-Design-Brief.md)).
- **No invented facts on the public site**: unverified details (artists, phone, socials) are tracked in [HOMEPAGE-AUDIT.md](HOMEPAGE-AUDIT.md) and omitted until confirmed.
- **Admins change content, not code**: questions, reference data, settings, announcements must never require a deployment.
- Next.js 16 conventions differ from older training data — consult `node_modules/next/dist/docs/` before writing framework code (per [AGENTS.md](../AGENTS.md)).
