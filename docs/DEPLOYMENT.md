# Deployment

## Pre-flight checklist

- [ ] `APP_SECRET` is 48+ random characters and **different from development**
- [ ] `APP_URL` is the public HTTPS origin
- [ ] `DATABASE_URL` points at production PostgreSQL, over TLS
- [ ] `STORAGE_DRIVER=s3` with a **private** bucket
- [ ] `SMTP_*` configured and a test message delivered
- [ ] `SEED_ADMIN_PASSWORD` changed after first sign-in
- [ ] RCCG reference data replaced with the official structure
- [ ] `SITE_DOMAIN` and `ACME_EMAIL` set (Docker deployments only)
- [ ] Terms and privacy notice reviewed
- [ ] Event name and dates set in Admin → Settings
- [ ] Departments reviewed in Admin → Departments — all **15** seed open, including the five carried over from the legacy records (Protocol, Accommodation Logistics, Transportation Logistics, Registration Unit, Medical Officer); close any that should not take 2027 applications, and give them question sets (copy from another team as a start)
- [ ] `npm run verify` passes, and `npx playwright test` passes against a **freshly started** dev server

`assertProductionSafety()` in `src/lib/env.ts` refuses to start with a short secret, a non-HTTPS
`APP_URL`, local storage or missing SMTP when `NODE_ENV=production`.

---

## Launch scope — what is live in the first release

The first release opens **the homepage, the About page, the Contact page and the registration journey**. Everything else on the
public site renders as "Coming soon" instead of linking to a page that does not exist yet or back to
the old WordPress site.

**Always live — no flag, and none should be added.** Registration cannot receive applications
without them:

| Route | Purpose |
|---|---|
| `/` | Homepage |
| `/about` | About page |
| `/contact` | Contact page and message form |
| `/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` | Account access |
| `/apply`, `/apply/[step]`, `/apply/submitted` | The nine-step wizard |
| `/dashboard`, `/dashboard/summary`, `/dashboard/account` | Volunteer dashboard |
| `/admin/*` | Review, exports, moderation |
| `/privacy`, `/terms` | Required by the consent step |
| `/api/*` | Uploads, reference data, exports |

**Flagged.** Each is one variable in `src/config/features.ts`, read from the environment:

| Flag | Default | What it controls |
|---|---|---|
| `NEXT_PUBLIC_FEATURE_LIVESTREAM` | `true` | YouTube links (channel already exists) |
| `NEXT_PUBLIC_FEATURE_SHARE_TESTIMONY` | `true` | On-page testimony form — moderated before publishing |
| `NEXT_PUBLIC_FEATURE_NEWSLETTER` | `true` | On-page newsletter signup |
| `NEXT_PUBLIC_FEATURE_GIVE` | `false` | **Donations** — see the note below |
| `NEXT_PUBLIC_FEATURE_ABOUT` | `true` | The `/about` page and every link to it |
| `NEXT_PUBLIC_FEATURE_BLOG` | `false` | Blog link and media card |
| `NEXT_PUBLIC_FEATURE_GALLERY` | `false` | Gallery link and media card |
| `NEXT_PUBLIC_FEATURE_MAGAZINE` | `false` | Magazine menu item and media card |
| `NEXT_PUBLIC_FEATURE_RADIO` | `false` | Radio menu item and media card |
| `NEXT_PUBLIC_FEATURE_PRAYER_REQUEST` | `false` | Prayer request link |
| `NEXT_PUBLIC_FEATURE_CONTACT` | `true` | The `/contact` page and every link to it |

> **Donations are switched off.** Giving is a working revenue path on the current site. It was
> disabled here on instruction, so no visitor can donate through the new homepage until you set
> `NEXT_PUBLIC_FEATURE_GIVE=true` and redeploy. If the old site stays online, keep it reachable, or
> turn this flag on before you switch the domain over.

To turn something on: set its variable to `true` and **redeploy**. `NEXT_PUBLIC_*` values are inlined
into the browser bundle at build time, so a restart alone will not pick up the change. Nothing else
needs editing — a flag switching on gives the link a destination, and the "Coming soon" state
disappears everywhere it appeared (header, footer, participation cards, activity cards, media cards).

---

## Option A — Vercel

1. Import the repository; the framework is detected automatically.
2. Add every variable from `.env.example` to the project.
3. Set the build command to `prisma migrate deploy && next build` so migrations run on deploy.
4. Attach PostgreSQL from the Vercel Marketplace, or point `DATABASE_URL` at your own instance.
5. Use S3-compatible storage — Vercel's filesystem is ephemeral, so `STORAGE_DRIVER=local` will lose
   uploads between deploys.
6. After the first deploy, run the seed once against production:
   `DATABASE_URL=<prod> npx tsx prisma/seed.ts`

Server Actions and Route Handlers run on Node.js (Fluid Compute) — no Edge runtime is used, and none
is needed: `sharp`, `exceljs` and `node:crypto` all require Node.

---

## Option B — Docker

The Dockerfile, `docker-compose.yml` and `docker/Caddyfile` in the repository root are the real,
maintained versions — they are not samples to copy out of this document.

```bash
cp .env.example .env.production          # fill it in first
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

`--env-file` is required. Compose substitutes `${VAR}` from `.env` by default, and every
`NEXT_PUBLIC_*` value is compiled into the browser bundle at build time — omit the flag and the
bundle ships with an empty site URL and every launch flag at its default.

**Four services** (Postgres runs on the same box — decision 2026-08-05):

| Service | What it does |
|---|---|
| `db` | PostgreSQL 16, data in the `pgdata` volume. Not exposed to the host — only the other services can reach it. Set `POSTGRES_PASSWORD` in `.env.production` and point `DATABASE_URL` at `postgresql://mmp:${POSTGRES_PASSWORD}@db:5432/mmp_registration`. **You own the backups** — put the `pg_dump` recipe below in cron on day one. |
| `migrate` | Runs `prisma migrate deploy` once and exits. `app` waits for it to succeed, so the server never runs against a schema the code does not match. |
| `app` | The Next.js standalone server. Not published to the host — only Caddy can reach it, so nobody can hit port 3000 on the public IP and bypass TLS. |
| `caddy` | TLS termination. Obtains and renews the Let's Encrypt certificate itself; there is no certbot to schedule. |

**Email (decision 2026-08-05: Resend).** Verify the sending domain in Resend,
create an SMTP credential, and set:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=<the Resend API key>
MAIL_FROM=MMPraise Volunteers <volunteers@mmpraise.org>
SUPPORT_EMAIL=volunteers@mmpraise.org
# Optional: diaspora mail never says "volunteer". Unset, it sends from the MAIL_FROM address as "MMPraise Diaspora".
# DIASPORA_MAIL_FROM=MMPraise Diaspora <diaspora@mmpraise.org>
# DIASPORA_REPLY_TO=diaspora@mmpraise.org
```

The backup recipe runs against the container:

```bash
docker compose --env-file .env.production exec db \
  pg_dump -U mmp -d mmp_registration --format=custom > "/backups/mmp-$(date +%F).dump"
```

**Image layout.** `next.config.ts` sets `output: 'standalone'`, so the runtime image carries a
self-contained server with only the modules it actually imports — no source tree and no dev
dependencies. The Prisma CLI is deliberately *not* in it: `prisma.config.ts` pulls in `dotenv` and
the CLI toolchain, which belong in the build stage. That is why `migrate` builds `target: build`.

No Prisma engine binary is needed at runtime — the app reaches PostgreSQL through the `pg` driver
adapter, which is plain JavaScript.

**Seed once, after the first deploy:**

```bash
docker compose --env-file .env.production run --rm migrate npx tsx prisma/seed.ts
```

**Uploads.** With `STORAGE_DRIVER=s3` nothing is written to the container filesystem. If you use
`STORAGE_DRIVER=local` instead, uploads go to the `uploads` volume — back it up, or a container
rebuild is survivable but a volume prune is not.

---

## Option C — Linux server (systemd)

```bash
git clone <repo> /srv/mmp && cd /srv/mmp
npm ci && npx prisma generate && npm run build
npx prisma migrate deploy
```

```ini
# /etc/systemd/system/mmp.service
[Unit]
Description=MMPraise Volunteer Registration
After=network.target postgresql.service

[Service]
Type=simple
User=mmp
WorkingDirectory=/srv/mmp
EnvironmentFile=/srv/mmp/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/mmp/storage

[Install]
WantedBy=multi-user.target
```

---

## Push-to-deploy

`.github/workflows/deploy.yml` ships `main` to the VPS. It runs the fast checks
first — typecheck, lint, the unit **and integration** tests, and a production
build — and only then connects over SSH and runs `scripts/deploy.sh`, which is
the same `git pull` / `build` / `up -d` you would type by hand. A health check
follows: if the site does not answer 200 within two minutes, the deploy fails
loudly rather than going green over a stack that never started.

Playwright is deliberately **not** a gate. It needs a seeded database, takes
about fifteen minutes, and currently carries one intermittent failure — gating
on it would block roughly half of all deploys for reasons unrelated to the
change being shipped. Run it before a release that matters.

The checks job starts a PostgreSQL service because the build genuinely needs a
database: prerendering `/privacy` reads the `Setting` model, and a build without
one dies with `DatabaseAccessDenied`. Missing rows fall back to `DEFAULTS`, so
the database only has to be migrated, not seeded.

### The image is built in CI, not on the VPS

The `image` job builds the Docker image on a GitHub runner and publishes it to
GHCR; the VPS pulls it. Deploying is then `pull` plus `up -d` — about a minute,
with no build load on the server.

This replaced building on the box, for two reasons. It was unusably slow: `npm
ci` alone ran to 42 minutes inside the image build and a full run passed 58
minutes without finishing. And it could not have succeeded anyway —
`.dockerignore` keeps every `.env` file out of the build context, so the build
stage had no `APP_SECRET` or `DATABASE_URL` and failed at environment parsing
before it reached the database. The Dockerfile now takes both as build
arguments, set to throwaway values in the `build` stage only; the runtime stage
starts from `base` again, so nothing is baked into the shipped image.

Images are tagged with the commit SHA as well as `latest`, and a deploy pins
the SHA. The box runs exactly the artefact the checks passed against, and
rolling back is re-running an older deploy rather than hoping `latest` still
points somewhere sensible.

### Behind a shared reverse proxy

On the production VPS this stack does **not** own ports 80 and 443. A shared
Caddy fronts every site on the machine and proxies `mmpraise.org` to
`mmpraise-app:3000`, so the app has to sit on that proxy's network under that
exact name.

For six weeks that wiring existed as nothing but runtime state: someone had run
`docker network connect` by hand and it was in no file anywhere. It survived
only because the container was never recreated. The first pipeline deploy
recreated it, the name stopped resolving, and the site returned 502 until the
command was run again by hand.

It is now declared. Set in `.env.production`:

```
PROXY_NETWORK=rcawards_default
```

`scripts/deploy.sh` then adds `docker-compose.proxy.yml`, which attaches the app
to that network with the `mmpraise-app` alias, and asserts afterwards that the
attachment took — a container that is healthy but invisible to the proxy serves
502s, and that reads as "the app is broken" when the app is fine.

The stack's own `caddy` service is behind the `standalone` profile so it cannot
start by accident and collide on port 80. For a box where this stack *does* own
the ports, leave `PROXY_NETWORK` unset and bring it up with
`docker compose --profile standalone up -d`.

**The diaspora host.** diaspora.mmpraise.org is this same app (see
[02-TRD.md](02-TRD.md) "Hosts"). It needs two things outside this repository:

1. A Cloudflare DNS record `diaspora` → the VPS IP, **DNS only** (grey cloud),
   matching the apex record.
2. The shared Caddy's site block (`/opt/rcawards/deploy/Caddyfile` on the VPS,
   mounted into `rcawards-caddy-1`) must name both hosts:

   ```
   mmpraise.org, diaspora.mmpraise.org {
   ```

   then reload without restarting the other sites:
   `docker exec rcawards-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.
   Add DNS first — Caddy requests the certificate as soon as it sees the name.

### Where the public configuration lives now

**This is the part that changes for you.** `NEXT_PUBLIC_*` values are compiled
into the browser bundle at build time, so whoever builds the image decides them.
That used to be the VPS, reading `.env.production`. It is now CI — so those
values have to exist in GitHub.

Add them as repository **variables**, not secrets (Settings → Secrets and
variables → Actions → Variables). They are not secret in any meaningful sense:
every one of them is shipped to every visitor's browser. The full list is the
`ARG NEXT_PUBLIC_*` block in the `Dockerfile`; copy the values from
`.env.production`.

A variable that is missing builds as an empty string — the same failure as a
forgotten `--env-file`, and just as silent. After the first CI-built deploy,
check the site actually shows the event date and that the launch flags are in
the state you expect.

Everything server-side — `DATABASE_URL`, `APP_SECRET`, SMTP, S3 — stays in
`.env.production` on the VPS and never goes near GitHub.

### Repository secrets

Settings → Secrets and variables → Actions:

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | The VPS address |
| `DEPLOY_USER` | The unprivileged owner of the deployment — `mmp` |
| `DEPLOY_SSH_KEY` | Private half of a key generated **for this purpose only** |
| `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan <host>`, so the host key is pinned |
| `DEPLOY_PORT` | Optional, defaults to 22 |
| `DEPLOY_PATH` | Optional, defaults to `/home/mmp/app` |
| `HEALTHCHECK_URL` | Optional, defaults to `https://mmpraise.org` |

Generate the key and pin the host:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
ssh-copy-id -i deploy_key.pub mmp@<host>       # public half onto the server
ssh-keyscan <host>                             # → DEPLOY_KNOWN_HOSTS
cat deploy_key                                 # → DEPLOY_SSH_KEY, then delete it locally
```

### Lock the key down

**This matters more here than on most projects.** The VPS runs PostgreSQL
alongside the app, so that database holds every volunteer's name, email, phone
and church details. An unrestricted deploy key means anyone who can push to this
repository — or anyone who compromises a GitHub Action — has a shell next to it.

Restrict the key to the one command it needs. On the server, prefix its line in
`~mmp/.ssh/authorized_keys`:

```
command="bash /home/mmp/deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA... github-actions-deploy
```

With a forced command the server runs its own copy of the script whatever the
client asks for, so a stolen key can redeploy and nothing else. Copy
`scripts/deploy.sh` to `/home/mmp/deploy.sh` and keep the two in step — or drop
the forced command and accept that the key is a shell.

---

## Migrations

Always `prisma migrate deploy` in production — never `migrate dev`, which can reset data.

```bash
npx prisma migrate deploy
```

Migrations run before the new version starts. Take a backup first (below). For a zero-downtime
change, split destructive migrations into two releases: add the new column and backfill, deploy the
code that uses it, then drop the old column in a later release.

---

## Backups

```bash
# Nightly, keep 30 days
pg_dump "$DATABASE_URL" --format=custom \
  --file="/backups/mmp-$(date +%F).dump"
find /backups -name 'mmp-*.dump' -mtime +30 -delete
```

Restore:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /backups/mmp-2026-12-01.dump
```

Uploaded files live in object storage — enable bucket versioning and lifecycle rules there. Test a
restore before the event, not after an incident.

---

## Monitoring

| Watch | Why |
|---|---|
| 5xx rate on `/apply/*` | A failing step blocks registrations |
| Submission rate | A sudden drop usually means a broken step, not less interest |
| `auth.login_failed` volume in `audit_logs` | Credential stuffing |
| `health.viewed` entries | Should be rare and attributable |
| Database connections and slow queries | The admin list is the heaviest query |
| Disk usage on `storage/` (local driver only) | Uploads accumulate |

Application logs go to stdout. `console.error` is used for genuine faults; audit entries are the
durable record of who did what.

---

## Scaling notes

- The app is stateless — run several instances behind a load balancer. Sessions and rate limits live
  in PostgreSQL, so they work across instances.
- Rate limiting is a database counter. Under very heavy load, move it to Redis behind the same
  interface in `src/lib/security/rate-limit.ts`.
- Reference endpoints set `Cache-Control`, so a CDN absorbs most of that traffic.
- Export is capped at 20,000 rows per request; for larger sets, filter and export in batches.

---

## Security operations

- Force HTTPS and enable HSTS at the proxy.
- Keep the storage bucket private; the app streams files through an authorising route.
- Rotate `APP_SECRET` only during a maintenance window — it invalidates CSRF tokens.
- Review `audit_logs` after the event, and act on data-deletion requests (flagged on the user record)
  within the 30 days promised in the privacy notice.
- Apply dependency updates: `npm audit`, then `npm run verify`.
