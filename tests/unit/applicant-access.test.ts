import { describe, expect, it } from 'vitest'
import { can, canViewApplicants } from '@/lib/auth/rbac'
import { sessionUser } from '../helpers/session'

/**
 * Viewing applicants and reviewing them are separate. A Communication Officer
 * needs to read the applicant list to choose who to message, but must not move
 * applications between statuses.
 */
describe('applicant access', () => {
  it('lets a Communication Officer view applicants without reviewing them', () => {
    const officer = sessionUser({ roles: ['COMMUNICATION_OFFICER'] })
    expect(canViewApplicants(officer)).toBe(true)
    expect(can(officer, 'application:review')).toBe(false)
    expect(can(officer, 'application:decide')).toBe(false)
  })

  it('keeps access for the roles that already had it', () => {
    for (const role of ['SUPER_ADMIN', 'REGISTRATION_ADMIN', 'REVIEWER', 'DEPARTMENT_HEAD'] as const) {
      expect(canViewApplicants(sessionUser({ roles: [role] })), role).toBe(true)
    }
  })

  it('gives volunteers no access to other applicants', () => {
    expect(canViewApplicants(sessionUser({ roles: ['VOLUNTEER'] }))).toBe(false)
  })

  it('follows a per-administrator withdrawal of the underlying grant', () => {
    const officer = sessionUser({
      roles: ['COMMUNICATION_OFFICER'],
      permissionOverrides: [{ permission: 'application:view_all', granted: false }],
    })
    expect(canViewApplicants(officer)).toBe(false)
  })
})
