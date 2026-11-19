# 03 — App Flow: Screens, Navigation and Key User Flows

Every route below exists in `src/app` (App Router). Route groups carry the guards described in [ARCHITECTURE.md](ARCHITECTURE.md): `(auth)` redirects away if signed in, `(volunteer)` requires `requireUser()`, `(admin)` requires `requireAdmin()` plus per-page `requirePermission()`, `(legal)` is open.

---

## 1. Screen inventory

### Public site (no account needed)

| Route | Screen |
|---|---|
| `/` | Homepage — hero, countdown, activities, testimonies, newsletter signup, volunteer CTA |
| `/about` | About the event and organisation |
| `/contact` | Contact form (categories, stored as `ContactMessage`, never emailed onward) |
| `/attending` | "I will be attending" share-card generator (built entirely in the browser) |
| `/terms`, `/privacy` | Legal pages, opened in a new tab from consent checkboxes |
| `diaspora.mmpraise.org/` (also `/diaspora` on the main host) | Diaspora participation form — 13 questions, one per screen, then review and a `DSP-` receipt. Host routing in `next.config.ts`: `/` on the diaspora host rewrites to `/diaspora`; every other page path there redirects to the main site |
| Blog / Gallery / Magazine / Radio / Prayer Request / Give | "Coming soon" until the matching `NEXT_PUBLIC_FEATURE_*` flag is on (`src/config/features.ts`) |

### Authentication `(auth)`

| Route | Screen |
|---|---|
| `/register` | Create account (issues the permanent MMP number) |
| `/login` | Sign in by email, username or MMP number |
| `/verify-email` | Email verification landing |
| `/forgot-password`, `/reset-password` | Password recovery |

### Volunteer area `(volunteer)`

| Route | Screen |
|---|---|
| `/apply` | Wizard entry — routes an already-registered volunteer to `/participate` automatically |
| `/apply/[step]` | The eight wizard steps (one page renders all of them): `personal`, `location`, `professional`, `church`, `department`, `availability`, `motivation`, `review` |
| `/apply/submitted` | Confirmation with the MMP number |
| `/participate` | Returning-volunteer edition confirmation: department (previous preselected), department questions, dates, shift periods, overnight, this edition's consents |
| `/dashboard` | Nine-stage journey hero, notifications, announcements, shifts, FAQs, resources |
| `/dashboard/summary` | Printable application summary |
| `/dashboard/account` | Account management (email, password, deletion request) |
| `/dashboard/messages`, `/dashboard/messages/[id]` | Direct-message inbox; opening a message marks it read (only the recipient's own copy can be opened) |

### Administration `(admin)` — all under `/admin`

| Route | Screen | Gate (from `src/lib/auth/rbac.ts`) |
|---|---|---|
| `/admin` | Overview command centre — needs-attention queue, event bar, lifecycle counts, trends, recent activity | admin |
| `/admin/applications`, `/admin/applications/[id]` | Applicant list (filters, bulk approve, export, message) and full application review | to open: any of `application:review` / `view_all` / `view_department` (`requireApplicantViewer`); status changes: `application:review`; decisions: `application:decide`. Communication Officers get these pages view-only |
| `/admin/testimonies`, `/admin/testimonies/[id]` | Moderation queue and detail with note timeline | `testimony:moderate` (+ `testimony:contact_view`) |
| `/admin/messages` | Contact inbox — split-view helpdesk | `contact:manage` |
| `/admin/announcements`, `.../new`, `.../[id]` | Announcement lifecycle list and editor | `announcement:manage` |
| `/admin/volunteer-messages`, `.../new`, `.../[id]` | Direct messages: sent list with read counts, compose (`?to=<userId>` or applicant-list filters), per-message recipients and read state | `volunteer:message` |
| `/admin/departments`, `.../[id]`, `.../[id]/questions` | Departments and the question builder with live preview | `department:manage`, `question:manage` |
| `/admin/previous-participants`, `.../new`, `.../[id]` | Legacy CSV migration: batches, upload/map, batch detail | `migration:*` |
| `/admin/diaspora`, `/admin/diaspora/[id]` | Diaspora responses: search, country/edition filters, repeat flag, CSV download; full response detail | `diaspora:view` |
| `/admin/users`, `/admin/users/[id]` | Administrators: list, permission matrix, suspend/disable, role history | `user:manage` |
| `/admin/reference` | Countries/states, RCCG hierarchy, lookup options | `reference:manage` |
| `/admin/settings` | Registration open/close and operational settings | `settings:manage` |
| `/admin/audit` | Activity log: All / Security & compliance / System views | `audit:view` |

### API route handlers (`src/app/api`)

| Route | Purpose |
|---|---|
| `GET /api/reference/[resource]` | Cacheable reference lists for the wizard (countries, states, regions, provinces, parishes, lookups) |
| `GET /api/departments/[id]/questions` | Active question set for a department (used by wizard/participate) |
| `GET /api/files/[id]` | Authorised file download — the only way a stored file is served |
| `GET /api/admin/export` | Filtered applicant export (CSV/Excel), audited |
| `GET /api/admin/export/contacts` | Contact-message export |
| `GET /api/admin/export/diaspora` | Diaspora responses CSV/Excel, same filters as the list, audited |

Plus `robots.ts`, `sitemap.ts`, `opengraph-image.tsx` at the app root.

## 2. Navigation map

```mermaid
flowchart LR
  subgraph Public
    HOME["/"] --> ABOUT["/about"]
    HOME --> CONTACT["/contact"]
    HOME --> ATTEND["/attending"]
    HOME --> CS["Coming soon pages (flags off)"]
  end
  HOME -->|Volunteer CTA| REG["/register"]
  REG --> VERIFY["/verify-email"] --> LOGIN["/login"]
  LOGIN --> DASH["/dashboard"]
  LOGIN -.->|admin roles| ADMIN["/admin"]
  DASH --> APPLY["/apply → /apply/[step] ×8"]
  DASH --> PART["/participate (returning)"]
  DASH --> SUM["/dashboard/summary"]
  DASH --> ACCT["/dashboard/account"]
  APPLY --> SUBMITTED["/apply/submitted"]
  ADMIN --> A1["applications"] & A2["testimonies"] & A3["messages"] & A4["announcements"]
  ADMIN --> A5["departments/questions"] & A6["previous-participants"] & A7["users"] & A8["reference · settings · audit"]
```

The admin shell groups navigation as Overview / Applications / People / Communications / Content / Configuration / Activity and security ([ADMIN-ROADMAP.md](ADMIN-ROADMAP.md), "Admin shell").

## 3. Key user flows

### 3.1 New volunteer registration (once, ever)

```mermaid
flowchart TD
  A[Create account /register] --> B[Verify email]
  B --> C[Sign in]
  C --> D[/apply → step 1 Personal/]
  D --> E[2 Location] --> F[3 Professional] --> G[4 Church<br/>denomination-conditional fields]
  G --> H[5 Department<br/>dynamic department questions]
  H --> I[6 Availability<br/>dates, shifts, emergency contact, health]
  I --> J[7 Motivation] --> K[8 Review<br/>per-section edit links]
  K -->|Submit| L[/apply/submitted<br/>MMP number + confirmation email/]
  D -. autosave draftData on every step .-> D
  L --> M[Dashboard: status SUBMITTED → UNDER_REVIEW → decision]
```

Answers to hidden conditional questions are pruned before save (`pruneHiddenAnswers`), asserted in unit and E2E tests.

### 3.2 Returning volunteer (each edition)

```mermaid
flowchart LR
  A[Sign in with email / username / MMP number] --> B{Migrated &<br/>mustReviewProfile?}
  B -->|yes| C[Confirm profile details] --> D
  B -->|no| D[Dashboard hero:<br/>"Confirm your availability"]
  D --> E[/participate: department + questions +<br/>dates + shifts + overnight + consents/]
  E --> F[EditionParticipation SIGNED_UP] --> G[ASSIGNED → CHECKED_IN → COMPLETED<br/>or WITHDRAWN]
```

### 3.3 Application review (admin)

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED: volunteer submits
  SUBMITTED --> UNDER_REVIEW
  UNDER_REVIEW --> APPROVED
  UNDER_REVIEW --> WAITLISTED
  UNDER_REVIEW --> REJECTED
  SUBMITTED --> APPROVED: bulk approve (≤500, re-count contract)
  APPROVED --> [*]: approval is permanent — per-edition state lives on EditionParticipation
```

Every transition writes `ApplicationStatusHistory` and an audit entry; decisions carry an optional reason.

### 3.4 Legacy migration (previous participants)

```mermaid
flowchart LR
  A[Upload CSV] --> B[Map columns<br/>auto-guessed] --> C[Dry-run validate<br/>per-row messages]
  C --> D{Confirm}
  D --> E[Queue ImportJobs<br/>chunks of 100]
  E --> F[Create or match users<br/>MMP numbers preserved]
  F --> G[PreviousEditionParticipation rows]
  G --> H[Optional invitations<br/>SENT ≠ DELIVERED, tracked per row]
  H --> I[Volunteer activates → reviews profile → participates]
  A -. same checksum + edition = same import, refused .-> A
```

### 3.5 Public testimony

Visitor submits on the homepage → stored `PENDING` with normalised body hash (duplicate detection) → moderator triages in `/admin/testimonies` (assign, note, approve/reject/spam/feature) → nothing renders publicly until approved.

### 3.6 Contact message

Visitor submits `/contact` → stored `NEW` (never emailed onward) → admin inbox: first open records `firstReadAt`, triage priority/assignment/notes → reply via handler's own mail client (`mailto:`) → `RESOLVED`.

### 3.8 Direct message to volunteers

```mermaid
flowchart LR
  L[/admin/applications — filtered list/] -->|Message these volunteers| C
  A[/admin/applications/id/] -->|Message volunteer| C[Compose: count shown, email notice optional]
  C --> S[sendVolunteerMessageAction]
  S -->|re-resolve with sender's scope;<br/>refuse if count changed| DB[(volunteer_messages +<br/>volunteer_message_recipients)]
  S -->|if ticked, ≤500| E[Email notice: subject + inbox link only]
  DB --> V[Volunteer: header badge, dashboard card, /dashboard/messages]
  V -->|open| R[readAt set]
```

Limits: 5,000 recipients per message; email notices only up to 500 (sent inside the request, like announcement emails). Above those, an announcement is the right tool.

### 3.7 Diaspora participation

```mermaid
flowchart LR
  W[Welcome] --> Q[13 questions, one per screen<br/>draft kept in localStorage] --> R[Review<br/>edit any answer] --> S[submitDiasporaAction]
  S -->|rate limit 20/h/IP, honeypot,<br/>Zod + country list check| DB[(diaspora_submissions)]
  S --> C[Confirmation: DSP- reference]
  DB --> A[/admin/diaspora — diaspora:view/] --> X[CSV download, audited]
```

No account is involved. A centre that submits again is stored again, not refused; the admin list flags responses sharing a centre email (case-insensitive) as **Repeat ×n** for the same edition.

---

*Screens verified against `src/app/**` on 2026-09-19. For per-step component code see `src/components/apply/steps/`.*
