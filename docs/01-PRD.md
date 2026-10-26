# 01 — Product Requirements Document (PRD)

**Project:** MMPraise Volunteer Registration
**Event:** 85 Hours Marathon Messiah's Praise 2027 (MMPraise)
**Status:** Built and in pre-launch hardening (see [06-Implementation-Plan.md](06-Implementation-Plan.md) and [GO-LIVE.md](GO-LIVE.md))

---

## 1. Overview

Marathon Messiah's Praise is an annual global gospel event where worshippers gather to praise God without stopping; each edition runs one hour longer than the last (2026: 84 hours, 2027: 85). This application is the **production volunteer registration platform** for the event. It replaces two legacy properties:

- the long single-page Bootstrap registration form at `mmpraise.tv/volunteer/account/`, and
- the public-facing pages of the WordPress site at `mmpraise.org` (homepage, About, Contact) that relate to registration.

The platform provides an accessible **eight-step registration wizard**, a **department-specific question engine** administrators can change without a deployment, a **volunteer dashboard**, a **returning-volunteer participation flow**, and a **role-based administration area** covering applications, testimonies, contact messages, announcements, legacy-data migration, and audit.

A foundational product decision (documented in [ADMIN-ROADMAP.md](ADMIN-ROADMAP.md)): **a volunteer registers once, not every edition.** The permanent MMP number (`User.mmpCode`, e.g. `MMP2214059`) identifies the person for life; each edition they return only to confirm availability, department and consents. Legacy data (13,973 rows, 2022–2026) confirmed this model.

## 2. Goals

1. Replace the legacy single-page form with an accessible, resumable, multi-step registration journey.
2. Let administrators change department questions, reference data (RCCG regions/provinces/parishes), and registration settings **without a code deployment**.
3. Migrate ~14,000 previous participants safely (idempotent CSV import, invitation campaign, profile-review gate) so returning volunteers keep their MMP number and history.
4. Give the organising team a complete operations console: review/approve applicants, assign shifts, moderate testimonies, triage contact messages, publish announcements, and audit every sensitive action.
5. Protect sensitive data by design — health information is role-gated and isolated; every access is audited.
6. Ship a brand-faithful public site (homepage, About, Contact) with everything else feature-flagged as "Coming soon" until switched on.

## 3. Target users

| User | Description |
|---|---|
| **New volunteer** | Registers an account, completes the eight-step wizard once, receives an MMP number, tracks status on the dashboard. |
| **Returning volunteer** | Migrated or previously approved; confirms availability, department and consents for the current edition at `/participate` — never re-enters the full form. |
| **Super Administrator** | Full access; manages other administrators, permissions, settings, reference data. |
| **Registration Administrator** | Reviews and decides applications, exports, assigns shifts, manages announcements/departments/questions. |
| **Department Head / Reviewer** | Scoped to specific departments via `UserDepartmentScope`; reviews applications in their department only. |
| **Medical Information Officer** | The only role (besides super admin) able to reveal restricted health information (`health:view`). |
| **Communication Officer** | Handles announcements, contact messages, testimonies. |
| **Public visitor** | Reads the homepage/About/Contact, shares a testimony, subscribes to the newsletter, sends a contact message, creates an "I will be attending" share card. |

Roles are defined in `prisma/schema.prisma` (`Role` enum) and mapped to explicit permissions in `src/lib/auth/rbac.ts`, with per-person overrides via `AdminPermissionGrant`.

## 4. Core features / requirements

### Volunteer-facing
- **Account creation** with email verification, password reset, and login by email, username **or MMP number**.
- **Eight-step wizard** (Personal → Location → Professional → Church → Department → Availability → Motivation → Review), defined in `src/lib/validation/registration.ts`. Only relevant questions appear: department questions are conditional, church questions depend on the chosen denomination, and guardian consent appears for minors.
- **Autosave**: progress persists (`VolunteerApplication.draftData`) and survives refresh, crash, or a different device.
- **Review step** with per-section edit links before submission; confirmation email and MMP number on submission.
- **Returning-volunteer flow** (`/participate`): one page — department (previous one preselected), department questions, dates, shift periods, overnight availability, this edition's consents.
- **Dashboard**: nine-stage journey status, announcements, shifts, FAQs, resources, account management.
- **Public pages**: homepage with countdown, About, Contact, legal (terms/privacy), testimony submission (moderated), newsletter signup, "attending" share card. All other destinations (Blog, Gallery, Magazine, Radio, Prayer Request, Give) render "Coming soon" behind `NEXT_PUBLIC_FEATURE_*` flags (`src/config/features.ts`). **Donations are off** at launch by client instruction.

### Administration
- **Applications**: search, filter, paginate; full application view including department answers; approve / waitlist / reject / bulk-approve (capped at 500, server re-count contract); shift assignment; internal notes; CSV/Excel export behind a confirmation dialog and audit entry.
- **Departments & questions**: create/edit/reorder departments and questions, conditional questions, retire/restore, copy question sets between departments (copies arrive retired), live preview through the same engine the wizard uses.
- **Announcements**: full lifecycle (Draft/Scheduled/Published/Expired/Archived), audience targeting, optional email delivery with per-run statistics, revision history, test send to self.
- **Testimonies**: moderation queue with duplicate detection (normalised body hash), assignment, spam/test flags, featured flag, note timeline; contact details behind `testimony:contact_view`.
- **Messages**: split-view contact inbox with priority, assignment, unread tracking (`firstReadAt`), duplicate grouping, note timeline.
- **Previous participants**: CSV upload → column mapping → dry-run validation → confirm → chunked import → invitations, all idempotent (file checksum + row-number uniqueness), with a database-backed job queue (`ImportJob`).
- **Administrators**: role management, three-state permission matrix, suspend-until/disable, role assignment history, self-protection rules.
- **Reference data**: countries/states, RCCG church hierarchy, lookup options — editable in admin.
- **Settings**: open/close registration and other operational settings (`Setting` key/value table).
- **Audit log**: humanised activity views (All / Security & compliance / System), filters, technical-details disclosure.

## 5. User stories

- *As a new volunteer*, I can create an account and complete registration in short steps on my phone, so an interruption never loses my progress.
- *As a volunteer who is a minor*, my guardian's name, phone and consent are captured before I can submit.
- *As a returning 2024 volunteer*, I sign in with the MMP number I already have and only confirm my availability for 2027 — I do not re-type my name and church.
- *As a registration administrator*, I can filter applicants by country, state, region, province, parish, status and age range, and export exactly the filtered set.
- *As a department head*, I only see applications for my departments, and I cannot widen my view by editing query parameters.
- *As the medical information officer*, I can reveal a volunteer's declared health condition; every reveal is audited, and no other administrator ever sees it — not even in exports or emails.
- *As a super administrator*, I can grant one reviewer the export permission without inventing a new role, and revoke a single capability without stripping a role.
- *As a communication officer*, I can publish an announcement to all volunteers, one department, or approved volunteers only, optionally emailing it, and later prove exactly what wording was sent.
- *As a public visitor*, I can share a testimony that will not appear anywhere until a moderator approves it.

## 6. Success metrics

Grounded in what the system measures and enforces (see [TESTING.md](TESTING.md) and [GO-LIVE.md](GO-LIVE.md)):

- **Migration integrity**: 13,969/13,969 legacy rows parse with 0 enum-translation errors and 0 duplicate MMP numbers (verified against the real export); re-import of the same file creates zero duplicates.
- **Registration completion**: a started draft can always be resumed; the wizard runs the full journey across desktop/mobile/tablet in the Playwright suite.
- **Data-protection guarantees**: an integration test asserts the admin list query cannot return health information; health access is 100% audited.
- **Accessibility**: axe-core checks pass in E2E; brand orange replaced by AA-compliant `#D63A02` for all interactive elements, with contrast ratios asserted in `tests/unit/contrast.test.ts`.
- **Quality gate**: `npm run verify` (typecheck → lint → unit/integration tests → build) green; full test suite green (372+ tests at last recorded run).
- **Operational**: registration can be opened/closed from admin without deployment; announcements deliverable to the full volunteer list with per-run success/failure counts.

## 7. Out of scope (first release)

- Blog, Gallery, Magazine, Radio, Prayer Request, **Give/donations** (feature-flagged off).
- Integrated email reply from the contact inbox (currently `mailto:`), canned responses.
- SMS channel, drag-and-drop question ordering, scheduled email worker for announcements, saved admin views — all tracked as later slices in [ADMIN-ROADMAP.md](ADMIN-ROADMAP.md).

---

*Related docs: [02-TRD.md](02-TRD.md) · [03-App-Flow.md](03-App-Flow.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [ADMIN-ROADMAP.md](ADMIN-ROADMAP.md)*
