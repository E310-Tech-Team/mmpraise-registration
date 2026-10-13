# Architecture

How the system is put together, and the reasoning behind the decisions that are not obvious from
the code.

---

## 1. Shape of the application

```
Browser ──► Next.js (App Router)
              ├── Server Components ── read via src/lib/**            ──► PostgreSQL (Prisma)
              ├── Server Actions ───── validate (Zod) → write         ──►
              ├── Route Handlers ───── /api/files, /api/reference, export
              └── Client Components ── wizard, filters, admin editors
                                          │
                                          └── shares Zod schemas and the question engine
                                              with the server — one implementation, two runtimes
```

Mutations go through **Server Actions**, which Next.js protects against cross-origin invocation.
Route Handlers exist only where a real HTTP response is needed: file downloads, cacheable reference
lists, and spreadsheet exports. Those carry an explicit CSRF check (`src/lib/security/csrf.ts`).

### Route groups

| Group | Paths | Guard |
|---|---|---|
| `(auth)` | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | none (redirects away if signed in) |
| `(volunteer)` | `/apply/*`, `/dashboard/*` | `requireUser()` |
| `(admin)` | `/admin/*` | `requireAdmin()` plus a per-page `requirePermission()` |
| `(legal)` | `/terms`, `/privacy` | none — opens in a new tab from consent checkboxes |

---

## 2. The central data-modelling decision

Fields that are **filtered, sorted, exported or reported on** are typed columns:
name, gender, age range, country, state, department, status. They are indexed and constrained by the
database.

Only **department-specific questions** use the dynamic engine
(`department_questions` → `question_options` → `application_answers` → `application_answer_options`).

This is the compromise that makes the brief's two requirements compatible:

- *"Administrators should be able to create or modify department questions without changing source
  code"* — satisfied by the dynamic engine.
- *"Filter by country, state, region, province, parish, status, age range"* — satisfied by real
  columns. Filtering across an entity-attribute-value table would be slow and painful to index.

A fully dynamic schema would have made every admin filter a self-join; fully static columns would
have meant a deployment for every new question.

---

## 3. The question engine

`src/lib/questions/engine.ts` is **isomorphic and dependency-free**. The browser uses it to decide
which questions to show and to validate before submitting; the server imports the same functions to
re-validate on save and again on submission. Because there is one implementation, client and server
cannot disagree about whether an answer was required.

It provides:

| Function | Responsibility |
|---|---|
| `isQuestionVisible` / `visibleQuestions` | Evaluate conditions, recursively (a child of a hidden parent is hidden) |
| `pruneHiddenAnswers` | Drop answers to questions that are no longer shown |
| `validateAnswers` | Required, length, numeric range, rating bounds, regex pattern, "Other" free text, option membership |
| `formatAnswer` | One rendering used by the review screen, the printed summary and the admin view |

Pruning matters: a volunteer who picks *Instrumentalist*, chooses *Drummer*, then switches to
*Singer* must not have a drummer answer stored. That is asserted in both the unit and the E2E suites.

Supported question types: text, textarea, email, tel, number, date, radio, checkbox, select,
multi-select, file upload and rating — plus conditional display on any choice question.

---

## 4. Authentication and authorisation

**Passwords** — scrypt from `node:crypto` (OWASP parameters N=2¹⁵, r=8, p=1), with the cost
parameters encoded in the stored string so they can be raised later and old hashes upgraded on the
next successful login. Chosen over bcrypt/argon2 bindings because it needs no native compilation,
which removes a common deployment failure.

**Sessions** — opaque 256-bit tokens in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. Only the
SHA-256 digest is stored, so a database disclosure cannot be replayed. Sessions are rows, so they are
revocable: changing a password revokes every session.

**Authorisation** — one table in `src/lib/auth/rbac.ts` maps each role to explicit permissions, so
the whole policy is auditable at a glance. Department heads additionally carry a *scope*, folded
into the SQL `WHERE` clause by `buildWhere()` rather than filtered after the fact — a scoped
administrator cannot widen their view by editing query parameters.

`departmentScope()` returns `null` for "no restriction" and `[]` for "nothing", a distinction the
tests cover explicitly because confusing the two would leak every application.

---

## 5. Health information

Declared medical conditions are the most sensitive data here, so they are isolated:

1. Stored in their own table (`application_health_info`), never joined into list queries.
2. Readable only through `revealHealthInfoAction`, gated on the `health:view` permission — held only
   by the Medical Information Officer and Super Administrator.
3. Not rendered with the review page: the value is fetched only when an authorised officer asks,
   so it is not present in the HTML sent to other administrators.
4. Every access writes a `health.viewed` audit entry.
5. Excluded from CSV/Excel exports and from every email template.

An integration test asserts the admin list query cannot return it.

---

## 6. Files

Uploads are the highest-risk input, so each one is checked against its **actual bytes**:

1. Size capped before reading into memory.
2. Magic bytes inspected — a `.png` that is really a script is rejected.
3. Images re-encoded through sharp, which strips EXIF (including GPS) and defeats polyglot files.
4. Stored under a random UUID with an extension *we* choose; the user's filename never touches the path.
5. Served only via `/api/files/[id]`, which checks ownership or role, sets `X-Content-Type-Options:
   nosniff` and a restrictive CSP, and audits third-party reads.

`STORAGE_DRIVER` switches between local disk (outside `public/`) and S3-compatible object storage
without any call-site change. Server-side encryption is requested only when
`S3_SERVER_SIDE_ENCRYPTION` is set, because a store without a key (a bare MinIO) rejects the request.

Every upload travels as a Server Action, so `serverActions.bodySizeLimit` in `next.config.ts` must stay
above the largest upload cap — Next.js otherwise refuses the body before the action's own size check
runs. Upload widgets catch a thrown action and show it inline; an uncaught one would replace the page
with the error screen.

---

## 7. Draft persistence

Two layers, because they answer different questions:

- **`draftData` (JSON)** — whatever the volunteer has typed, saved on a 1.5s debounce, on tab hide
  and on unmount. Never validated, so a half-finished phone number survives a refresh.
- **Normalised tables** — written when a step passes validation. This is what review, reporting and
  export read.

On load, the persisted record is the base and the draft is layered on top. A failed save never
clears the form.

---

## 8. Registration numbers

Allocated from a PostgreSQL sequence (`registration_id_seq`), not `COUNT(*) + 1`, so two concurrent
submissions can never collide. Format `MMP-<year>-<six digits>`. Drafts hold a placeholder keyed on
the full user id until submission.

---

## 9. Accessibility

WCAG 2.1 AA is a build-time constraint, not a review item:

- Contrast ratios are asserted against the real tokens in `tests/unit/contrast.test.ts`.
- The brand orange `#F34402` measures 3.72:1 on white — below AA for normal text — so it is reserved
  for large display type, and a separate `--color-primary` (`#D63A02`, 4.70:1) is used for every
  interactive element. The test documents the split so it cannot be undone by accident.
- Every wizard step is scanned with axe on desktop, mobile and tablet.
- Errors carry an icon and text, never colour alone; the error summary is focusable and links to
  each field; touch targets are at least 44px.

---

## 10. Performance

- The initial page never downloads every country, region and parish. Dependent lists load on demand
  through `/api/reference/*` with `Cache-Control` and an in-page memo cache.
- Only the selected department's questions are fetched.
- Admin tables are paginated server-side; search is debounced.
- `next/font` self-hosts Afacad and Figtree, so there is no render-blocking font request.
- Profile photographs are re-encoded to WebP at a maximum of 800px.

---

## 11. Where to change things

| Task | Place |
|---|---|
| Colours, spacing, radii | `src/app/globals.css` (`@theme`) |
| Add a wizard step | `src/lib/validation/registration.ts` (`WIZARD_STEPS`) + a step component + an action |
| Add a department question | Admin → Departments & questions (no code) |
| Change a permission | `ROLE_PERMISSIONS` in `src/lib/auth/rbac.ts` |
| Add an export column | `COLUMNS` and the row builder in `src/app/api/admin/export/route.ts` |
| Change email wording | `src/lib/mail/templates.ts` |
