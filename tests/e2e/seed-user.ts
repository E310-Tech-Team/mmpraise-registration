import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { Client } from 'pg'
import { hashPassword } from '../../src/lib/auth/password'

config({ path: '.env' })
config({ path: '.env.local', override: true })

/**
 * Create a signed-up volunteer directly in the database.
 *
 * The dashboard suite used to reach its fixture by filling in the sign-up form.
 * That made every dashboard assertion depend on registration succeeding, and
 * registration is rate limited per IP by design — a suite that runs three
 * projects from one address exhausts the allowance and then fails with
 * "username already taken" for a username that is provably unique, because the
 * *account was created* and only the client-side redirect was lost.
 *
 * Those were never dashboard failures. Creating the row here removes the
 * sign-up form, its rate limit and its redirect from a suite that is not
 * testing any of them. Registration itself is still covered end to end by
 * tests/e2e/registration.spec.ts, which is where that belongs.
 *
 * Plain SQL rather than the Prisma client: Playwright transpiles these files to
 * CommonJS, which the generated ESM client cannot be loaded from. `hashPassword`
 * is safe to import because it uses nothing but `node:crypto`.
 */
export type SeededVolunteer = {
  email: string
  username: string
  password: string
  firstName: string
  lastName: string
  /** The permanent MMP number, allocated from the same sequence the app uses. */
  mmpCode: string
}

export async function seedVolunteer(prefix = 'dash'): Promise<SeededVolunteer> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 16)
  const volunteer: SeededVolunteer = {
    email: `${prefix}.${stamp}@example.com`,
    username: `${prefix}${stamp}`.slice(0, 30),
    password: 'Praise2027!Dash',
    firstName: 'Test',
    lastName: 'Volunteer',
    mmpCode: '',
  }

  const passwordHash = await hashPassword(volunteer.password)
  const userId = `u_${stamp}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    // Drawn from the real sequence rather than made up, so the fixture cannot
    // collide with an account the application itself created.
    const seq = await client.query(`SELECT nextval('mmp_code_seq') AS v`)
    volunteer.mmpCode = `MMP${String(seq.rows[0].v).padStart(7, '0')}`

    await client.query(
      `INSERT INTO users (id, email, username, "passwordHash", "mmpCode", "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [userId, volunteer.email, volunteer.username, passwordHash, volunteer.mmpCode],
    )
    await client.query(
      `INSERT INTO user_roles (id, "userId", role) VALUES ($1, $2, 'VOLUNTEER')`,
      [`r_${stamp}`, userId],
    )
    await client.query(
      `INSERT INTO volunteer_profiles (id, "userId", "firstName", "lastName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [`p_${stamp}`, userId, volunteer.firstName, volunteer.lastName],
    )
    /*
     * The draft the wizard would have created on first visit. Seeding it here
     * means the dashboard is exercised in the state it is actually met in —
     * `currentStep` 1, nothing saved — rather than in the rarer "no application
     * row at all" state.
     */
    await client.query(
      `INSERT INTO volunteer_applications (id, "registrationId", "userId", status, "currentStep", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'DRAFT', 1, now(), now())`,
      [`a_${stamp}`, `DRAFT-${userId}`, userId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }

  return volunteer
}


/**
 * A volunteer from a previous edition: registered, approved, but with no
 * confirmed participation for the current one — exactly the state every
 * returning volunteer is in the day a new edition opens.
 *
 * The unconfirmed 2027 row is deliberately absent rather than blank: the
 * dashboard must handle "no row yet" because that is what a genuine edition
 * rollover produces.
 */
export async function seedReturningVolunteer(prefix = 'return'): Promise<SeededVolunteer> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 16)
  const volunteer: SeededVolunteer = {
    email: `${prefix}.${stamp}@example.com`,
    username: `${prefix}${stamp}`.slice(0, 30),
    password: 'Praise2027!Dash',
    firstName: 'Returning',
    lastName: 'Volunteer',
    mmpCode: '',
  }

  const passwordHash = await hashPassword(volunteer.password)
  const userId = `u_${stamp}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    const seq = await client.query(`SELECT nextval('mmp_code_seq') AS v`)
    volunteer.mmpCode = `MMP${String(seq.rows[0].v).padStart(7, '0')}`

    await client.query(
      `INSERT INTO users (id, email, username, "passwordHash", "mmpCode", "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [userId, volunteer.email, volunteer.username, passwordHash, volunteer.mmpCode],
    )
    await client.query(`INSERT INTO user_roles (id, "userId", role) VALUES ($1, $2, 'VOLUNTEER')`, [
      `r_${stamp}`,
      userId,
    ])
    await client.query(
      `INSERT INTO volunteer_profiles (id, "userId", "firstName", "lastName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [`p_${stamp}`, userId, volunteer.firstName, volunteer.lastName],
    )
    // Registered and approved once — the one-time judgement, already made.
    await client.query(
      `INSERT INTO volunteer_applications (id, "registrationId", "userId", status, "currentStep", "submittedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'APPROVED', 8, now() - interval '1 year', now() - interval '1 year', now())`,
      [`a_${stamp}`, `MMP-2026-9${stamp.slice(0, 5)}`, userId],
    )
    // Their history: a completed earlier edition, department Welfare if seeded.
    const dept = await client.query(`SELECT id FROM departments WHERE slug = 'welfare' LIMIT 1`)
    await client.query(
      `INSERT INTO edition_participations (id, "applicationId", edition, year, "departmentId", status, "confirmedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, '2026', 2026, $3, 'COMPLETED', now() - interval '1 year', now() - interval '1 year', now())`,
      [`ep26_${stamp}`, `a_${stamp}`, dept.rows[0]?.id ?? null],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }

  return volunteer
}


/**
 * A volunteer whose application is SUBMITTED and awaiting review — the state
 * the bulk-approve flow consumes. Confirmed participation included, so the
 * row also renders a department in the applicants list.
 */
export async function seedSubmittedVolunteer(prefix = 'subm'): Promise<SeededVolunteer> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 16)
  const volunteer: SeededVolunteer = {
    email: `${prefix}.${stamp}@example.com`,
    username: `${prefix}${stamp}`.slice(0, 30),
    password: 'Praise2027!Dash',
    firstName: 'Submitted',
    lastName: 'Volunteer',
    mmpCode: '',
  }

  const passwordHash = await hashPassword(volunteer.password)
  const userId = `u_${stamp}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    const seq = await client.query(`SELECT nextval('mmp_code_seq') AS v`)
    volunteer.mmpCode = `MMP${String(seq.rows[0].v).padStart(7, '0')}`

    await client.query(
      `INSERT INTO users (id, email, username, "passwordHash", "mmpCode", "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [userId, volunteer.email, volunteer.username, passwordHash, volunteer.mmpCode],
    )
    await client.query(`INSERT INTO user_roles (id, "userId", role) VALUES ($1, $2, 'VOLUNTEER')`, [
      `r_${stamp}`,
      userId,
    ])
    await client.query(
      `INSERT INTO volunteer_profiles (id, "userId", "firstName", "lastName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [`p_${stamp}`, userId, volunteer.firstName, volunteer.lastName],
    )
    await client.query(
      `INSERT INTO volunteer_applications (id, "registrationId", "userId", status, "currentStep", "submittedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SUBMITTED', 8, now() - interval '10 days 12 hours', now() - interval '10 days 12 hours', now())`,
      [`a_${stamp}`, `MMP-2027-8${stamp.slice(0, 5)}`, userId],
    )
    const dept = await client.query(`SELECT id FROM departments WHERE slug = 'welfare' LIMIT 1`)
    await client.query(
      `INSERT INTO edition_participations (id, "applicationId", edition, year, "departmentId", status, "confirmedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, '2027', 2027, $3, 'SIGNED_UP', now() - interval '10 days', now(), now())`,
      [`ep_${stamp}`, `a_${stamp}`, dept.rows[0]?.id ?? null],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }

  return volunteer
}

/**
 * A testimony submission, written straight to the database.
 *
 * The body hash uses the same module the application writes with, so the
 * duplicate detection under test is the real rule, not a copy of it.
 */
/**
 * A volunteer who has been given an administrative role.
 *
 * The suite needs somebody it can suspend, permission-tweak and demote without
 * touching the seeded super administrator it signs in as — every one of those
 * actions is refused on yourself, and rightly.
 */
export async function seedAdmin(
  role: 'REVIEWER' | 'COMMUNICATION_OFFICER' | 'REGISTRATION_ADMIN' = 'REVIEWER',
): Promise<SeededVolunteer & { id: string }> {
  const volunteer = await seedVolunteer('admin')
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client = new Client({ connectionString })
  await client.connect()
  try {
    const found = await client.query('SELECT id FROM users WHERE email = $1', [volunteer.email])
    const userId = found.rows[0].id as string
    await client.query('INSERT INTO user_roles (id, "userId", role) VALUES ($1, $2, $3)', [
      `ar_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      userId,
      role,
    ])
    return { ...volunteer, id: userId }
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * A retired question on a department, written straight to the database.
 *
 * Retirement normally happens only to a question that has answers, which the
 * suite has no clean way to produce. Seeding it directly gives the restore
 * path something deterministic to act on, independent of what the shared
 * seed data happens to contain.
 */
export async function seedRetiredQuestion(
  departmentSlug: string,
): Promise<{ id: string; label: string; key: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 10)
  const id = `dq_${stamp}`
  const key = `retired_${stamp}`
  const label = `Retired question ${stamp}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    const department = await client.query('SELECT id FROM departments WHERE slug = $1 LIMIT 1', [
      departmentSlug,
    ])
    const departmentId = department.rows[0]?.id
    if (!departmentId) throw new Error(`No department with slug ${departmentSlug}`)

    await client.query(
      `INSERT INTO department_questions
         (id, "departmentId", key, label, type, "isRequired", "isActive", "sortOrder", "parentOptionValues", "allowedMimeTypes")
       VALUES ($1, $2, $3, $4, 'TEXT', false, false, 900, '{}', '{}')`,
      [id, departmentId, key, label],
    )
  } finally {
    await client.end().catch(() => undefined)
  }

  return { id, label, key }
}

/** Remove a seeded question outright, whatever state it is in. */
export async function deleteSeededQuestion(id: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('DELETE FROM department_questions WHERE id = $1', [id])
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * An announcement in an arbitrary lifecycle state, written straight to the
 * database — for pre-states the UI cannot create, like "scheduled for a moment
 * that has already passed".
 */
export async function seedAnnouncement(options: {
  title?: string
  body?: string
  status?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED' | 'ARCHIVED'
  /** Minutes from now; negative for the past. */
  scheduledInMinutes?: number
  publishedMinutesAgo?: number
}): Promise<{ id: string; title: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 12)
  const id = `an_${stamp}`
  const title = options.title ?? `Briefing ${stamp}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO announcements
         (id, title, body, audience, status,
          "scheduledFor", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'ALL_VOLUNTEERS', $4,
               CASE WHEN $5::int IS NULL THEN NULL ELSE now() + ($5::int || ' minutes')::interval END,
               CASE WHEN $6::int IS NULL THEN NULL ELSE now() - ($6::int || ' minutes')::interval END,
               now(), now())`,
      [
        id,
        title,
        options.body ?? 'Gates open at six. Stewards gather at the north entrance at five.',
        options.status ?? 'DRAFT',
        options.scheduledInMinutes ?? null,
        options.publishedMinutesAgo ?? null,
      ],
    )
  } finally {
    await client.end().catch(() => undefined)
  }

  return { id, title }
}

/**
 * Retire every announcement the suite seeded and left live.
 *
 * Announcements broadcast to every volunteer, so one left PUBLISHED would leak
 * into the dashboard suite's "no announcements yet" empty state. Seeded ids
 * all start `an_`; real ones are cuids and are never touched.
 */
export async function expireSeededAnnouncements(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `UPDATE announcements
       SET status = 'EXPIRED', "expiresAt" = now(), "updatedAt" = now()
       WHERE id LIKE 'an\\_%' AND status IN ('PUBLISHED', 'SCHEDULED')`,
    )
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * A contact message, written straight to the database.
 *
 * As with testimonies, the message hash comes from the shared module so the
 * duplicate grouping under test is the application's real rule.
 */
export async function seedContactMessage(options: {
  prefix?: string
  message: string
  subject?: string
  name?: string
  email?: string
  isTestData?: boolean
}): Promise<{ id: string; email: string; subject: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const { normalisedBodyHash } = await import('../../src/lib/testimonies/hash')
  const stamp = randomUUID().replace(/-/g, '').slice(0, 12)
  const id = `cm_${stamp}`
  const subject = options.subject ?? `Enquiry ${stamp}`
  const email = options.email ?? `${options.prefix ?? 'ask'}.${stamp}@example.org`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO contact_messages
         (id, category, name, email, subject, message, status, priority,
          "messageHash", "isTestData", "createdAt", "updatedAt")
       VALUES ($1, 'GENERAL', $2, $3, $4, $5, 'NEW', 'NORMAL', $6, $7, now(), now())`,
      [
        id,
        options.name ?? 'Kemi Balogun',
        email,
        subject,
        options.message,
        normalisedBodyHash(options.message),
        options.isTestData ?? false,
      ],
    )
  } finally {
    await client.end().catch(() => undefined)
  }

  return { id, email, subject }
}

export async function seedTestimony(options: {
  prefix?: string
  body: string
  title?: string
  authorName?: string
  isTestData?: boolean
}): Promise<{ id: string; email: string; title: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const { testimonyBodyHash } = await import('../../src/lib/testimonies/hash')
  const stamp = randomUUID().replace(/-/g, '').slice(0, 12)
  const id = `t_${stamp}`
  const title = options.title ?? `Praise report ${stamp}`
  const email = `${options.prefix ?? 'story'}.${stamp}@example.org`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO testimony_submissions
         (id, title, body, "authorName", email, country, "isAnonymous", "consentToPublish",
          status, "bodyHash", "isTestData", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'Nigeria', false, true, 'PENDING', $6, $7, now(), now())`,
      [
        id,
        title,
        options.body,
        options.authorName ?? 'Grace Adeyemi',
        email,
        testimonyBodyHash(options.body),
        options.isTestData ?? false,
      ],
    )
  } finally {
    await client.end().catch(() => undefined)
  }

  return { id, email, title }
}

/**
 * A previous participant exactly as the importer leaves them: an account with
 * the unusable-password sentinel (cannot sign in until a reset), the migrated
 * flags, and history in one earlier edition — but no application, which is
 * precisely the population the old "not yet confirmed" figure could not see.
 */
export async function seedPreviousParticipant(prefix = 'prev'): Promise<{
  id: string
  email: string
  firstName: string
  lastName: string
}> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const stamp = randomUUID().replace(/-/g, '').slice(0, 16)
  const id = `u_${stamp}`
  const email = `${prefix}.${stamp}@example.com`
  const firstName = 'Former'
  const lastName = `Volunteer${stamp.slice(0, 6)}`

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    const seq = await client.query(`SELECT nextval('mmp_code_seq') AS v`)
    const mmpCode = `MMP${String(seq.rows[0].v).padStart(7, '0')}`
    await client.query(
      `INSERT INTO users (id, email, username, "passwordHash", "mmpCode", "isPreviousEditionUser",
                          "mustReviewProfile", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, '!migrated-no-password', $4, true, true, now(), now())`,
      [id, email, `${prefix}${stamp}`.slice(0, 30), mmpCode],
    )
    await client.query(`INSERT INTO user_roles (id, "userId", role) VALUES ($1, $2, 'VOLUNTEER')`, [
      `r_${stamp}`,
      id,
    ])
    await client.query(
      `INSERT INTO volunteer_profiles (id, "userId", "firstName", "lastName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [`p_${stamp}`, id, firstName, lastName],
    )
    await client.query(
      `INSERT INTO previous_edition_participations (id, "userId", edition, year, "previousDepartment", "createdAt")
       VALUES ($1, $2, '2025', 2025, 'Welfare', now())`,
      [`pep_${stamp}`, id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }

  return { id, email, firstName, lastName }
}
