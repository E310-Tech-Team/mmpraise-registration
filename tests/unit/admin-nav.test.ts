import { describe, expect, it } from 'vitest'
import { firstAdminHref, visibleNav } from '@/components/admin/admin-nav'
import type { Role } from '@/generated/prisma/enums'
import { sessionUser } from '../helpers/session'

/**
 * Where "Admin" lands. /admin (the overview) needs application:review; anyone
 * without it is redirected to firstAdminHref — which must therefore never be
 * /admin itself for them, or the redirect would loop.
 */
const ADMIN_ROLES: Role[] = [
  'SUPER_ADMIN',
  'REGISTRATION_ADMIN',
  'DEPARTMENT_HEAD',
  'REVIEWER',
  'MEDICAL_INFO_OFFICER',
  'COMMUNICATION_OFFICER',
]

describe('admin landing', () => {
  it('sends a Communication Officer to the applicant list', () => {
    expect(firstAdminHref(sessionUser({ roles: ['COMMUNICATION_OFFICER'] }))).toBe('/admin/applications')
  })

  it('keeps reviewers on the overview', () => {
    expect(firstAdminHref(sessionUser({ roles: ['REGISTRATION_ADMIN'] }))).toBe('/admin')
  })

  it('never lands a non-reviewer on /admin, so the redirect cannot loop', () => {
    for (const role of ADMIN_ROLES) {
      const user = sessionUser({ roles: [role] })
      const seesOverview = visibleNav(user).some((group) => group.items.some((item) => item.href === '/admin'))
      if (!seesOverview) expect(firstAdminHref(user), role).not.toBe('/admin')
    }
  })

  it('shows a volunteer no administration sections', () => {
    expect(visibleNav(sessionUser({ roles: ['VOLUNTEER'] }))).toEqual([])
    expect(firstAdminHref(sessionUser({ roles: ['VOLUNTEER'] }))).toBeNull()
  })
})
