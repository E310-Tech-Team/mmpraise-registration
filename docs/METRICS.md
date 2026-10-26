# Admin metric dictionary

Every figure on the admin overview, what it counts, and where it leads. The
predicates live in code — `src/lib/admin/metrics.ts` (applications,
participation, comms, time buckets) and `src/lib/admin/participants.ts`
(person-level previous-participant stages) — and the overview, the list pages
and the exports all import the same builders, so a card and its destination
cannot disagree. `tests/e2e/admin-overview.spec.ts` asserts the equality;
`tests/unit/admin-metrics.test.ts` covers the pure parts.

Conventions:

- **Scope.** A department head sees every figure restricted to their
  departments — the same restriction as the lists they click into.
- **Timezone.** All reporting dates and buckets are **Africa/Lagos (WAT)**,
  the event's own clock. Times are labelled "WAT".
- **Honesty.** `0` means a real zero. "Not tracked" means the system never
  recorded it (with the date tracking began, where known). "N/A" means a
  percentage with a zero denominator. Nothing historical is reconstructed:
  what the old pipeline destroyed is reported as not tracked, never invented.

## Registrations — entity: `VolunteerApplication` (one per person, edition-independent)

| Metric | Predicate | % of | Destination |
|---|---|---|---|
| Registered | `status != DRAFT` (includes legacy ASSIGNED/CHECKED_IN/COMPLETED, called out in a footnote) | — | `/admin/applications` |
| In progress (draft) | `status = DRAFT` | — | `?status=DRAFT` |
| Awaiting review | `status IN (SUBMITTED, UNDER_REVIEW)` | registered | `?status=SUBMITTED,UNDER_REVIEW` |
| Approved / Waitlisted / Not accepted | exact status | registered (Approved) | `?status=…` |
| Submitted, last 7 days | `submittedAt ≥ now−7d` (rolling) | — | trend chart week buckets |

## This edition — entity: `EditionParticipation` for `eventConfig.edition`

**Confirmed** (decided 2026-10-13): `confirmedAt` set **and** not withdrawn
**and** the application is not rejected. Waitlisted people who confirmed count
— they are standing by to serve.

| Metric | Predicate | % of | Destination |
|---|---|---|---|
| Confirmed | as above | — | `?confirmed=1` |
| Signed up / Assigned / Checked in / Completed | `status = X` within Confirmed | confirmed | `?confirmed=1&participation=X` |
| Withdrawn | `status = WITHDRAWN` | ever-confirmed (confirmed+withdrawn) | `?participation=WITHDRAWN` |
| Registered, not confirmed | application in SUBMITTED/UNDER_REVIEW/APPROVED/WAITLISTED with no confirmed participation | those statuses | `?status=…&confirmed=0` |

"Registered, not confirmed" and the previous-participants "not yet responded"
figure **overlap** once a migrated person registers; they are shown side by
side and never summed.

## Previous participants — entity: **unique people** (`User` with ≥1 `PreviousEditionParticipation`)

A person mentioned in three import files is **one** person here. Anything
counted off CSV rows is labelled "rows" and lives on the Import rows screen.

Response **stages** partition the population (each person in exactly one,
precedence top-down — `stageWhere` / `deriveStage`):

| Stage | Meaning |
|---|---|
| Excluded from contact | an administrator excluded them (`excludedFromInvites`) |
| Confirmed this edition | confirmed `EditionParticipation` for the current edition |
| Started, not confirmed | has an application (drafts included), not confirmed |
| Activated, not started | account usable (password set, or matched an existing account), no application |
| Invited, not activated | a successful invitation send exists (`invitationSentKey` — survives activation), account not usable |
| Not yet invited | none of the above |

| Metric | Numerator / denominator | Destination |
|---|---|---|
| People | all previous participants | people view |
| Invited | people ever successfully sent an invitation / **invitable** (import-created, not excluded) | `people?invited=1` |
| Activated | usable accounts / **contactable** (all − excluded) | `people?activated=1` |
| Profiles reviewed | `profileReviewedAt` set / activated — **tracked from 2026-10-13**; earlier history was never recorded | `people?reviewed=1` |
| Confirmed this edition (response rate) | confirmed / contactable | `people?stage=confirmed` |
| Not yet responded | contactable − confirmed | `people?responded=0` |
| Follow-ups due / overdue | latest contact's `nextFollowUpAt` arrived, outcome still open, **and no qualifying response since** (confirmation, or activation after the contact) — derived, never written | `people?followup=due|overdue` |
| Invitation failures | **rows** with `invitationStatus = FAILED` (BOUNCED is impossible today — no delivery webhook exists) | `rows?invitation=FAILED` |
| Import rows needing attention | rows `FAILED` (import crashed) and `INVALID` (file data bad) | `rows?status=FAILED,INVALID` |

## Communications — gated by each destination's own permission

| Metric | Predicate | Destination |
|---|---|---|
| New messages | `status=NEW AND NOT isTestData AND NOT isSpam` — matches the inbox default view; needs `contact:manage` | `/admin/messages` |
| Pending testimonies | `status=PENDING AND NOT isTestData AND NOT isSpam`; needs `testimony:moderate` | `/admin/testimonies` |
| Failed invitation emails | invitation sends only — other mail is not centrally tracked yet | `rows?invitation=FAILED` |

## Email semantics

- **Sent** = the mail transport accepted the message (SMTP acceptance).
  **Delivered/Bounced are not tracked** — no provider webhook exists.
- In development no SMTP is configured; sends are written to `storage/mail`
  and the run is visibly labelled "written to file (dev)" (`mailerMode`).
- Every bulk send is an `OutreachRun` of per-recipient `OutreachAttempt`s.
  Pre-rework history was backfilled from `invitationSentKey` — one SENT
  attempt per person, approximate timestamps, no failure history (that was
  never recorded and is reported as not tracked).

## Changing this dictionary

Add or change a predicate in the metrics/participants modules, never inline in
a page. If a new audit action is involved, `src/lib/audit/labels.ts` needs a
label (a unit test enforces coverage). Update this file in the same change.
