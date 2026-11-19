import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureSeedData, hasTestDatabase, migrateTestDatabase, resetVolunteerData, testDb } from '../helpers/db'
import { sessionUser } from '../helpers/session'
import { hashPassword } from '@/lib/auth/password'
import {
  createVolunteerMessage,
  inboxFor,
  openMessage,
  resolveRecipients,
  unreadMessageCount,
} from '@/lib/messages/service'

/**
 * Direct messages against a real database. The property that matters most is
 * scoping: a sender reaches exactly the volunteers they can see on the
 * applicant list, and a volunteer can only ever open their own copy.
 */
const describeDb = hasTestDatabase ? describe : describe.skip

describeDb('volunteer direct messages', () => {
  const db = hasTestDatabase ? testDb() : (null as never)
  let praise: { userId: string; departmentId: string }
  let ushering: { userId: string; departmentId: string }

  async function submittedVolunteer(email: string, departmentSlug: string) {
    const department = await db.department.findUniqueOrThrow({ where: { slug: departmentSlug } })
    const user = await db.user.create({
      data: {
        email,
        username: email.split('@')[0]!.replace(/[^a-z0-9.]/g, ''),
        passwordHash: await hashPassword('Praise2026!'),
        roles: { create: [{ role: 'VOLUNTEER' }] },
        profile: { create: { firstName: 'Test', lastName: departmentSlug } },
        applications: {
          create: {
            registrationId: `MSG-${departmentSlug}`,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            participations: { create: { edition: '2027', year: 2027, departmentId: department.id } },
          },
        },
      },
    })
    return { userId: user.id, departmentId: department.id }
  }

  beforeAll(async () => {
    migrateTestDatabase()
    await ensureSeedData()
  }, 120_000)

  beforeEach(async () => {
    await db.volunteerMessage.deleteMany()
    await resetVolunteerData()
    await db.user.deleteMany({ where: { email: { endsWith: '@messages.test' } } })
    praise = await submittedVolunteer('praise@messages.test', 'praise-team')
    ushering = await submittedVolunteer('ushering@messages.test', 'ushering')
  })

  it('reaches every visible volunteer for an administrator who sees all applications', async () => {
    const admin = sessionUser({ id: 'admin', roles: ['SUPER_ADMIN'] })
    const ids = await resolveRecipients(admin, { mode: 'filter', filters: {} }, 100)
    expect(ids.sort()).toEqual([praise.userId, ushering.userId].sort())
  })

  it("never reaches another department's volunteers, even when named directly", async () => {
    const head = sessionUser({ id: 'head', roles: ['DEPARTMENT_HEAD'], departmentScopes: [praise.departmentId] })

    expect(await resolveRecipients(head, { mode: 'filter', filters: {} }, 100)).toEqual([praise.userId])
    expect(await resolveRecipients(head, { mode: 'individual', userId: ushering.userId }, 100)).toEqual([])
    expect(await resolveRecipients(head, { mode: 'individual', userId: praise.userId }, 100)).toEqual([praise.userId])
  })

  it('narrows by the applicant-list filters', async () => {
    const admin = sessionUser({ id: 'admin', roles: ['SUPER_ADMIN'] })
    const ids = await resolveRecipients(admin, { mode: 'filter', filters: { departmentId: ushering.departmentId } }, 100)
    expect(ids).toEqual([ushering.userId])
  })

  it('delivers to each inbox, tracks unread, and marks read on first open', async () => {
    const sender = await db.user.create({
      data: { email: 'sender@messages.test', username: 'msgsender', passwordHash: await hashPassword('Praise2026!') },
    })
    const message = await createVolunteerMessage({
      senderId: sender.id,
      subject: 'Rehearsal moved',
      body: 'Saturday rehearsal is now at 4pm.',
      selection: { mode: 'filter', filters: {} },
      userIds: [praise.userId, ushering.userId],
      emailRequested: false,
    })

    expect(await unreadMessageCount(praise.userId)).toBe(1)
    expect((await inboxFor(praise.userId))[0]?.message.subject).toBe('Rehearsal moved')

    const opened = await openMessage(praise.userId, message.id)
    expect(opened?.readAt).toBeInstanceOf(Date)
    expect(await unreadMessageCount(praise.userId)).toBe(0)
    // Reading one copy does not touch anybody else's.
    expect(await unreadMessageCount(ushering.userId)).toBe(1)
  })

  it('will not open a message for someone it was not sent to', async () => {
    const sender = await db.user.create({
      data: { email: 'sender2@messages.test', username: 'msgsender2', passwordHash: await hashPassword('Praise2026!') },
    })
    const message = await createVolunteerMessage({
      senderId: sender.id,
      subject: 'Just for praise',
      body: 'Only one recipient.',
      selection: { mode: 'individual', userId: praise.userId },
      userIds: [praise.userId],
      emailRequested: false,
    })
    expect(await openMessage(ushering.userId, message.id)).toBeNull()
  })
})
