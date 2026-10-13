import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureSeedData,
  hasTestDatabase,
  migrateTestDatabase,
  resetVolunteerData,
  testDb,
} from '../helpers/db'
import { sessionUser } from '../helpers/session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { isUniqueViolation } from '@/lib/db-errors'
import type { AnswerMap, QuestionDef } from '@/lib/questions/engine'
import { pruneHiddenAnswers } from '@/lib/questions/engine'

/**
 * Integration tests against a real PostgreSQL database.
 *
 * These cover the behaviour that only shows up once the schema is involved:
 * answer persistence and pruning, registration-number allocation under
 * concurrency, status history, and the isolation of health information.
 */
const describeDb = hasTestDatabase ? describe : describe.skip

describeDb('application persistence', () => {
  const db = hasTestDatabase ? testDb() : (null as never)

  beforeAll(async () => {
    migrateTestDatabase()
    await ensureSeedData()
  }, 120_000)

  beforeEach(async () => {
    await resetVolunteerData()
  })

  async function createVolunteer(email = 'test.volunteer@example.com') {
    return db.user.create({
      data: {
        email,
        username: email.split('@')[0]!.replace(/[^a-z0-9.]/g, ''),
        passwordHash: await hashPassword('Praise2026!'),
        roles: { create: [{ role: 'VOLUNTEER' }] },
        profile: { create: { firstName: 'Test', lastName: 'Volunteer' } },
      },
    })
  }

  /**
   * The application plus its current-edition participation, mirroring the
   * wizard: the person applies once; the department belongs to the edition.
   */
  async function createApplication(userId: string, departmentSlug = 'praise-team') {
    const department = await db.department.findUnique({ where: { slug: departmentSlug } })
    const application = await db.volunteerApplication.create({
      data: {
        userId,
        registrationId: `DRAFT-${userId.slice(-8)}`,
        status: 'DRAFT',
      },
    })
    const participation = await db.editionParticipation.create({
      data: {
        applicationId: application.id,
        edition: '2027',
        year: 2027,
        departmentId: department!.id,
      },
    })
    return { ...application, participationId: participation.id }
  }

  async function loadQuestions(slug: string): Promise<QuestionDef[]> {
    const department = await db.department.findUnique({ where: { slug } })
    const rows = await db.departmentQuestion.findMany({
      where: { departmentId: department!.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    })
    return rows.map((q) => ({
      id: q.id,
      key: q.key,
      label: q.label,
      helpText: q.helpText,
      type: q.type,
      isRequired: q.isRequired,
      sortOrder: q.sortOrder,
      maxLength: q.maxLength,
      minValue: q.minValue,
      maxValue: q.maxValue,
      ratingMin: q.ratingMin,
      ratingMax: q.ratingMax,
      allowedMimeTypes: q.allowedMimeTypes,
      maxFileSizeKb: q.maxFileSizeKb,
      placeholder: q.placeholder,
      pattern: q.pattern,
      patternMessage: q.patternMessage,
      parentQuestionId: q.parentQuestionId,
      parentOptionValues: q.parentOptionValues,
      options: q.options.map((o) => ({ id: o.id, value: o.value, label: o.label, requiresText: o.requiresText })),
    }))
  }

  it('stores the seeded departments and their conditional questions', async () => {
    const departments = await db.department.findMany()
    expect(departments.length).toBeGreaterThanOrEqual(10)

    const questions = await loadQuestions('praise-team')
    const instrument = questions.find((q) => q.key === 'instrument')
    expect(instrument?.parentQuestionId).toBeTruthy()
    expect(instrument?.parentOptionValues).toContain('instrumentalist')
  })

  it('persists answers with their chosen options and free text', async () => {
    const user = await createVolunteer()
    const application = await createApplication(user.id)
    const questions = await loadQuestions('praise-team')
    const { persistAnswers } = await import('@/lib/applications/service')

    const answers: AnswerMap = {
      first_time: { options: [{ value: 'no' }] },
      music_option: { options: [{ value: 'instrumentalist' }] },
      instrument: { options: [{ value: 'other', otherText: 'Cello' }] },
    }

    await persistAnswers(application.participationId, questions, answers)

    const stored = await db.applicationAnswer.findMany({
      where: { participationId: application.participationId },
      include: { question: true, options: { include: { option: true } } },
    })

    expect(stored).toHaveLength(3)
    const instrument = stored.find((a) => a.question.key === 'instrument')
    expect(instrument?.options[0]?.option.value).toBe('other')
    expect(instrument?.options[0]?.otherText).toBe('Cello')
  })

  it('does not persist answers to questions that are no longer visible', async () => {
    const user = await createVolunteer()
    const application = await createApplication(user.id)
    const questions = await loadQuestions('praise-team')
    const { persistAnswers } = await import('@/lib/applications/service')

    // The volunteer chose Singer, but an instrument answer lingers from before.
    const answers: AnswerMap = {
      first_time: { options: [{ value: 'yes' }] },
      music_option: { options: [{ value: 'singer' }] },
      voice_role: { options: [{ value: 'alto' }] },
      instrument: { options: [{ value: 'drummer' }] },
    }

    expect(Object.keys(pruneHiddenAnswers(questions, answers))).not.toContain('instrument')

    await persistAnswers(application.participationId, questions, answers)

    const keys = (
      await db.applicationAnswer.findMany({
        where: { participationId: application.participationId },
        include: { question: { select: { key: true } } },
      })
    ).map((a) => a.question.key)

    expect(keys).toContain('voice_role')
    expect(keys).not.toContain('instrument')
  })

  it('replaces answers rather than accumulating them when a step is re-saved', async () => {
    const user = await createVolunteer()
    const application = await createApplication(user.id)
    const questions = await loadQuestions('praise-team')
    const { persistAnswers } = await import('@/lib/applications/service')

    await persistAnswers(application.participationId, questions, {
      first_time: { options: [{ value: 'yes' }] },
      music_option: { options: [{ value: 'singer' }] },
      voice_role: { options: [{ value: 'alto' }] },
    })
    await persistAnswers(application.participationId, questions, {
      first_time: { options: [{ value: 'yes' }] },
      music_option: { options: [{ value: 'singer' }] },
      voice_role: { options: [{ value: 'tenor' }] },
    })

    const answers = await db.applicationAnswer.findMany({
      where: { participationId: application.participationId },
      include: { question: { select: { key: true } }, options: { include: { option: true } } },
    })
    expect(answers).toHaveLength(3)
    expect(answers.find((a) => a.question.key === 'voice_role')?.options[0]?.option.value).toBe('tenor')
  })
})

describeDb('registration numbers and status history', () => {
  const db = hasTestDatabase ? testDb() : (null as never)

  beforeAll(async () => {
    migrateTestDatabase()
    await ensureSeedData()
  }, 120_000)

  it('allocates unique, well-formed registration ids even in parallel', async () => {
    const { nextRegistrationId } = await import('@/lib/applications/service')
    const ids = await Promise.all(Array.from({ length: 25 }, () => nextRegistrationId()))

    expect(new Set(ids).size).toBe(25)
    for (const id of ids) expect(id).toMatch(/^MMP-\d{4}-\d{6}$/)
  })

  it('records every status transition with its previous value', async () => {
    await resetVolunteerData()
    const user = await db.user.create({
      data: {
        email: 'status.test@example.com',
        username: 'status.test',
        passwordHash: await hashPassword('Praise2026!'),
      },
    })
    const application = await db.volunteerApplication.create({
      data: { userId: user.id, registrationId: 'MMP-TEST-1', status: 'SUBMITTED' },
    })

    const { transitionStatus } = await import('@/lib/applications/service')
    await transitionStatus({ applicationId: application.id, to: 'UNDER_REVIEW', actorId: user.id })
    await transitionStatus({
      applicationId: application.id,
      to: 'APPROVED',
      actorId: user.id,
      reason: 'Strong candidate',
    })

    const history = await db.applicationStatusHistory.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: 'asc' },
    })

    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      ['SUBMITTED', 'UNDER_REVIEW'],
      ['UNDER_REVIEW', 'APPROVED'],
    ])
    expect(history[1]?.reason).toBe('Strong candidate')

    const updated = await db.volunteerApplication.findUnique({ where: { id: application.id } })
    expect(updated?.status).toBe('APPROVED')
  })
})

describeDb('health information isolation', () => {
  const db = hasTestDatabase ? testDb() : (null as never)

  beforeAll(async () => {
    migrateTestDatabase()
    await ensureSeedData()
  }, 120_000)

  it('keeps health data out of the admin list query', async () => {
    await resetVolunteerData()

    const user = await db.user.create({
      data: {
        email: 'health.test@example.com',
        username: 'health.test',
        passwordHash: await hashPassword('Praise2026!'),
        profile: { create: { firstName: 'Health', lastName: 'Test' } },
      },
    })
    const department = await db.department.findFirst()
    const application = await db.volunteerApplication.create({
      data: {
        userId: user.id,
        registrationId: 'MMP-TEST-HEALTH',
        status: 'SUBMITTED',
        submittedAt: new Date(),
        participations: {
          create: { edition: '2027', year: 2027, departmentId: department!.id },
        },
      },
    })
    await db.applicationHealthInfo.create({
      data: { applicationId: application.id, hasCondition: true, details: 'Severe nut allergy' },
    })

    const { listApplications } = await import('@/lib/admin/queries')
    const result = await listApplications(
      sessionUser({ id: 'admin', email: 'admin@example.com', username: 'admin', roles: ['REGISTRATION_ADMIN'] }),
      {},
    )

    expect(result.total).toBe(1)
    // The serialised result must contain nothing from the health table.
    expect(JSON.stringify(result)).not.toContain('nut allergy')
    expect(JSON.stringify(result)).not.toContain('hasCondition')
  })

  it('scopes a department head to their own departments', async () => {
    await resetVolunteerData()

    const [media, welfare] = await Promise.all([
      db.department.findUnique({ where: { slug: 'media' } }),
      db.department.findUnique({ where: { slug: 'welfare' } }),
    ])

    for (const [index, department] of [media, welfare].entries()) {
      const user = await db.user.create({
        data: {
          email: `scope${index}@example.com`,
          username: `scope${index}`,
          passwordHash: await hashPassword('Praise2026!'),
          profile: { create: { firstName: 'Scope', lastName: `Test${index}` } },
        },
      })
      await db.volunteerApplication.create({
        data: {
          userId: user.id,
          registrationId: `MMP-TEST-SCOPE-${index}`,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          // Scoping now reads the current edition's participation.
          participations: {
            create: { edition: '2027', year: 2027, departmentId: department!.id },
          },
        },
      })
    }

    const { listApplications } = await import('@/lib/admin/queries')
    const head = sessionUser({
      id: 'head',
      email: 'head@example.com',
      username: 'head',
      roles: ['DEPARTMENT_HEAD'],
      departmentScopes: [media!.id],
    })

    const scoped = await listApplications(head, {})
    expect(scoped.total).toBe(1)
    expect(scoped.items[0]?.participations[0]?.department?.id).toBe(media!.id)

    // Asking for another department must not widen the scope.
    const attempted = await listApplications(head, { departmentId: welfare!.id })
    expect(attempted.total).toBe(0)
  })
})

describeDb('credentials', () => {
  const db = hasTestDatabase ? testDb() : (null as never)

  beforeAll(async () => {
    migrateTestDatabase()
    await ensureSeedData()
  }, 120_000)

  it('stores only a hash, and the hash verifies', async () => {
    await resetVolunteerData()
    const user = await db.user.create({
      data: {
        email: 'creds@example.com',
        username: 'creds',
        passwordHash: await hashPassword('Praise2026!'),
      },
    })

    const stored = await db.user.findUnique({ where: { id: user.id } })
    expect(stored!.passwordHash).not.toContain('Praise2026!')
    expect(await verifyPassword('Praise2026!', stored!.passwordHash)).toBe(true)
    expect(await verifyPassword('wrong', stored!.passwordHash)).toBe(false)
  })

  it('rejects a duplicate email address at the database level', async () => {
    await resetVolunteerData()
    const data = {
      email: 'duplicate@example.com',
      username: 'duplicate',
      passwordHash: await hashPassword('Praise2026!'),
    }
    await db.user.create({ data })
    await expect(db.user.create({ data: { ...data, username: 'duplicate2' } })).rejects.toThrow()
  })

  it('rejects a duplicate phone number at the database level', async () => {
    await resetVolunteerData()
    await db.user.create({
      data: {
        email: 'phone1@example.com',
        username: 'phone1',
        phone: '+2348031234567',
        passwordHash: await hashPassword('Praise2026!'),
      },
    })
    await expect(
      db.user.create({
        data: {
          email: 'phone2@example.com',
          username: 'phone2',
          phone: '+2348031234567',
          passwordHash: await hashPassword('Praise2026!'),
        },
      }),
    ).rejects.toThrow()
  })

  /*
   * Against the real error, not a hand-built one: the wizard's friendly "that
   * number is already registered" depends on recognising exactly what Prisma
   * throws through the pg adapter, and a mocked shape is what let that drift
   * unnoticed for a month.
   */
  it('recognises the duplicate phone error the wizard turns into a friendly message', async () => {
    await resetVolunteerData()
    const base = { passwordHash: await hashPassword('Praise2026!') }
    await db.user.create({ data: { ...base, email: 'owner@example.com', username: 'owner', phone: '+2348031234567' } })
    const second = await db.user.create({ data: { ...base, email: 'second@example.com', username: 'second' } })

    // The same write the wizard's personal step makes.
    const error = await db.user
      .update({ where: { id: second.id }, data: { phone: '+2348031234567' } })
      .catch((caught: unknown) => caught)

    expect(isUniqueViolation(error, 'phone')).toBe(true)
    expect(isUniqueViolation(error, 'email')).toBe(false)
  })
})
