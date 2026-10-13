# Setup

## Requirements

- Node.js 20 or later (developed on 22)
- PostgreSQL 14 or later
- npm 10 or later

## 1. Install

```bash
npm install
```

`postinstall` runs `prisma generate`, which writes the typed client to `src/generated/prisma`. That
directory is generated and git-ignored — regenerate it after any schema change.

## 2. Configure

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:password@host:5432/mmp_registration?schema=public` |
| `TEST_DATABASE_URL` | for tests | A **separate** database; integration tests delete rows |
| `APP_SECRET` | yes | 48+ random characters. Signs CSRF tokens |
| `APP_URL` | yes | Public origin. Used in email links and the CSRF origin check |
| `SESSION_TTL_HOURS` | no | Default 168 (7 days) |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `STORAGE_LOCAL_PATH` | no | Default `./storage/uploads`. Must be outside `public/` |
| `MAX_UPLOAD_MB` | no | Default 5 |
| `S3_*` | in production | Bucket, region, credentials, optional endpoint for R2/MinIO/Spaces |
| `SMTP_*`, `MAIL_FROM` | in production | Leave `SMTP_HOST` empty to write emails to `storage/mail` instead |
| `RATE_LIMIT_*` | no | Login and registration windows |
| `SEED_ADMIN_*` | no | Bootstrap administrator created by the seed |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Environment variables are parsed and validated once at startup by `src/lib/env.ts`, so a
misconfigured deployment fails immediately rather than at the first request that needs the value.

## 3. Create the database

```bash
createdb mmp_registration
createdb mmp_registration_test     # only needed to run the tests
npm run db:migrate
```

## 4. Seed

```bash
npm run db:seed
```

The seed is idempotent — safe to re-run. It creates:

| Data | Count | Note |
|---|---|---|
| Countries | 201 | Names resolved from ICU; Nigeria, UK, US, Canada, Ghana, South Africa, Kenya, UAE pinned to the top |
| States/provinces | 138 | All 36 Nigerian states plus the FCT, and subdivisions for six other countries |
| RCCG regions / provinces / parishes | 26 / 67 / 11 | **Placeholder** — see below |
| Departments | 10 | With capacities |
| Department questions | 34 | Including the conditional branches |
| Lookup options | 42 | Occupation, education, discovery source |
| Settings | 6 | Registration open, event name, dates, support email |
| Super administrator | 1 | From `SEED_ADMIN_*` |

> **Change the seeded administrator password immediately after first sign-in.**

### Reference data

The RCCG regions and provinces shipped with the seed follow real naming conventions but are **not
the official directory**. Replace them before opening registration:

**Admin → Reference data** lets a Registration Administrator add, rename and deactivate regions,
provinces and parishes. Records are deactivated rather than deleted so that profiles already
pointing at them keep working.

For a bulk import, write to the `church_regions`, `church_provinces` and `parishes` tables directly,
or extend `prisma/seed-data/church.ts` and re-run the seed.

## 5. Run

```bash
npm run dev
```

| URL | Purpose |
|---|---|
| `/` | Public landing page |
| `/register` | Create a volunteer account |
| `/apply` | Registration wizard (resumes at the last step) |
| `/dashboard` | Volunteer dashboard |
| `/admin` | Administration (requires an admin role) |

## 6. Email in development

With `SMTP_HOST` empty, every message is written to `storage/mail/` as HTML with the recipient and
subject in a comment at the top. Verification and password-reset links are in those files — open the
newest one to continue a flow without a mail server.

## 7. Granting administrator roles

Sign in as the seeded super administrator, then **Admin → Administrators**. Enter the email address
of an existing volunteer account and select roles:

| Role | Can |
|---|---|
| Super Administrator | Everything, including user management |
| Registration Administrator | Applications, decisions, exports, settings, reference data, questions |
| Department Head | Only their own departments — review, notes, shifts, exports, announcements |
| Reviewer | Read applications and add notes; cannot decide outcomes |
| Medical Information Officer | The only role that can view declared health information |
| Communication Officer | Email volunteers and publish announcements |

The last Super Administrator cannot be demoted.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Invalid environment configuration` | A required variable is missing or malformed. The message names it |
| `Argument … must not be null` from Prisma | The generated client is stale. `npm run db:generate`, then restart the dev server |
| Emails not arriving | `SMTP_HOST` is unset — look in `storage/mail/` |
| "Too many registration attempts" | The rate limiter. Wait, or clear `rate_limit_buckets` in development |
| Uploads fail | Check `STORAGE_LOCAL_PATH` exists and is writable, and `MAX_UPLOAD_MB` |
| Uploads fail with `KMS is not configured` | `S3_SERVER_SIDE_ENCRYPTION` is set but the store (usually MinIO) has no key. Unset it |
| `Body exceeded … limit` in the logs | An upload is larger than `serverActions.bodySizeLimit` in `next.config.ts`. Keep that above every upload cap |
