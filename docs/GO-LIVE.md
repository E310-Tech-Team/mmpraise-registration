# Go live on a Hostinger VPS

The ordered checklist for the first launch. `docs/DEPLOYMENT.md` explains how deployment works in
general; this is what to actually type.

**What the first release opens:** the homepage, the About page, the Contact page and the
registration journey. Every other public destination says "Coming soon" — see *Launch scope* in
`docs/DEPLOYMENT.md`.

Decisions made 2026-08-05: **PostgreSQL runs on this same VPS** (the `db`
service in `docker-compose.yml` — nothing to provision), and **Resend** sends
the email. That leaves three accounts to have ready before starting: the VPS
itself, a Resend account with the sending domain verified, and an
S3-compatible bucket for uploads (Cloudflare R2's free tier is fine). The rest
is configuration and one `docker compose` command.

---

## 1. Prepare the VPS

SSH in as root, then:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

Create an unprivileged user to own the deployment, and let it use Docker:

```bash
adduser --disabled-password --gecos "" mmp && usermod -aG docker mmp
```

Lock the box down before anything is listening on it. Only SSH, HTTP and HTTPS should be reachable:

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

> Do not open 3000. The app is not published to the host at all — Caddy reaches it over Docker's
> internal network, so there is no way to hit it without TLS.

---

## 2. Point the domain at the VPS

In your DNS provider, create an `A` record for the domain (and `www` if you want it) pointing at the
VPS's IPv4 address. Add an `AAAA` record if the VPS has IPv6.

**Do this before step 5.** Caddy requests the certificate on first start by proving it controls the
domain; if DNS has not propagated, that fails and it retries with a backoff.

Check it resolves before continuing:

```bash
dig +short mmpraise.org
```

---

## 3. Get the code onto the server

```bash
su - mmp
git clone <your-repo-url> /home/mmp/app && cd /home/mmp/app
```

If the repository is not on a remote yet, `rsync -av --exclude node_modules --exclude .next
./ mmp@<vps-ip>:/home/mmp/app/` from your machine does the same job.

---

## 4. Write `.env.production`

```bash
cp .env.example .env.production
chmod 600 .env.production      # it holds the database password and the SMTP password
nano .env.production
```

Everything in the file needs a value. The ones that must not be left at their development defaults:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | The public HTTPS origin, e.g. `https://mmpraise.org` |
| `APP_SECRET` | 48+ random characters. Generate one with the command below. |
| `POSTGRES_PASSWORD` | A long random password for the on-box database. Generate it the same way as `APP_SECRET`. |
| `DATABASE_URL` | Exactly `postgresql://mmp:<that password>@db:5432/mmp_registration` — the `db` hostname is the compose service. No `sslmode`: the connection never leaves Docker's internal network. |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` | Your bucket (Cloudflare R2 works: region `auto`, endpoint from the R2 dashboard). Keep it **private** — the app streams files through an authorising route, so public access is never needed. |
| `S3_SERVER_SIDE_ENCRYPTION` | Leave **unset** unless the store has an encryption key configured. AWS S3 and R2 encrypt at rest anyway; a MinIO without a KMS key rejects every upload that asks, which stopped all profile photos from 2026-09-16 to 2026-10-13. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Resend: `smtp.resend.com`, `465`, `true` |
| `SMTP_USER`, `SMTP_PASSWORD` | Resend: literally `resend`, and an API key created in their dashboard |
| `MAIL_FROM`, `SUPPORT_EMAIL` | `MMPraise Volunteers <volunteers@mmpraise.org>` — the domain must be verified in Resend first, or everything lands in spam or is refused |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The bootstrap administrator. Change the password after first sign-in. |
| `NEXT_PUBLIC_SITE_URL` | Same as `APP_URL` |
| `SITE_DOMAIN` | The bare domain for the certificate, e.g. `mmpraise.org` (no `https://`) |
| `ACME_EMAIL` | Where Let's Encrypt sends expiry warnings |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`assertProductionSafety()` in `src/lib/env.ts` refuses to boot with a short secret, a non-HTTPS
`APP_URL`, local storage or missing SMTP. That is deliberate: a container that will not start is
better than a site that silently loses uploads or cannot send verification emails.

---

## 5. Build and start

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose logs -f
```

`--env-file` is not optional: every `NEXT_PUBLIC_*` value is compiled into the browser bundle at
build time, and without the flag Compose reads them from `.env` (which does not exist here) and
bakes in empty strings.

The `migrate` service runs first, applies the migrations and exits. `app` only starts once it has
succeeded. Caddy then requests the certificate — the first start takes a few extra seconds.

---

## 6. Seed, then lock down the admin account

Once, after the first successful deploy:

```bash
docker compose --env-file .env.production run --rm migrate npx tsx prisma/seed.ts
```

This creates the fifteen departments and their questions, the reference data (countries, states,
RCCG structure) and one super administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

Then, immediately:

1. Sign in as that administrator and change the password.
2. Create real administrator accounts with the narrowest role that fits. Only medical information
   officers can open health answers, and every one of those views is written to the audit log.
3. Replace the seeded RCCG regions and provinces with the official structure
   (**Admin → Reference data**) — the seeded values are a placeholder.
4. Review **Admin → Departments**: all fifteen teams seed open for applications, and the five
   carried over from the legacy records (Protocol, Accommodation Logistics, Transportation
   Logistics, Registration Unit, Medical Officer) have no question sets yet. Close any that should
   not take 2027 volunteers, and give the rest questions — the questions screen can copy another
   department's set as a starting point.

---

## 7. Redeploying later

Pushing to `main` now does this for you — see *Push-to-deploy* in
`docs/DEPLOYMENT.md` for the secrets to add and how to lock the deploy key down.
By hand, or when the pipeline is unavailable:

```bash
cd /home/mmp/app && git pull
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

Migrations are applied automatically on the way up. Changing any `NEXT_PUBLIC_*` value — including
turning a launch flag on — needs a **rebuild**, not just a restart, because those values live in the
browser bundle.

---

## 8. Backups

The database lives on this box, so **these dumps are the only copy that exists**. Set this up the
same day the site goes live, and copy the dumps somewhere off the VPS (the storage bucket works):

```bash
# /etc/cron.daily/mmp-backup  (chmod +x)
set -e
mkdir -p /home/mmp/backups
cd /home/mmp/app
docker compose --env-file .env.production exec -T db \
  pg_dump -U mmp -d mmp_registration --format=custom \
  > "/home/mmp/backups/mmp-$(date +%F).dump"
find /home/mmp/backups -name 'mmp-*.dump' -mtime +30 -delete
```

Enable versioning and lifecycle rules on the storage bucket for the uploaded photos and
certificates. **Test a restore before the event, not after an incident.**

---

## 9. Before you announce it

- [ ] `https://<domain>/` loads over HTTPS with a valid certificate
- [ ] `https://<domain>/register` creates an account and the verification email **arrives**
- [ ] The nine wizard steps complete and the submission appears in `/admin/applications`
- [ ] A profile photo uploads and is still there after `docker compose up -d --build`
- [ ] Password reset delivers a working link
- [ ] `/privacy` and `/terms` have been read by whoever is accountable for them
- [ ] The event name and edition are correct in **Admin → Settings**
- [ ] A database backup has been taken **and a restore tested**
- [ ] Someone owns the **Admin → Testimonies** moderation queue
- [ ] Someone owns the **Admin → Messages** inbox — contact messages are stored, not emailed onward
- [ ] A message sent from `/contact` appears in `/admin/messages`

---

## 10. Decisions still outstanding

**Donations are switched off.** Giving is a working revenue path on the current WordPress site and is
disabled in this release. Nobody can donate through the new homepage. If this site takes over the
domain, either keep the old giving page reachable or set `NEXT_PUBLIC_FEATURE_GIVE=true` and rebuild.

**The 2027 date is not set.** `NEXT_PUBLIC_EVENT_STARTS_AT` is intentionally empty, so the countdown
shows "date to be announced" and the `Event` structured data is omitted — schema.org requires a start
date, and invalid markup is worse than none. Set it when the date is confirmed and both correct
themselves.

**The map graphic still reads "80 Countries"** while the prose says 82 nations. The image was carried
over as-is rather than silently altered; it needs re-exporting with the right figure.

**Artist names are not published anywhere on the source site.** The seven portraits render with a
neutral caption. `src/content/artists.ts` already has `name`, `country` and `role` fields, and the
layout does not shift when they are filled in.

**Testimonies and newsletter signups are moderated.** Nothing a visitor submits appears publicly
until an administrator approves it.
