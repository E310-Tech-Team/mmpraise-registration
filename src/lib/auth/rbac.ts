import 'server-only'
import { redirect } from 'next/navigation'
import type { Role } from '@/generated/prisma/enums'
import { getSessionUser, type SessionUser } from './session'

export { ADMIN_ROLES, ROLE_LABELS } from './roles'

/**
 * Role-based access control.
 *
 * Permissions are declared per role in one table so an auditor can read the
 * whole policy in a single place, and so a new role never silently inherits
 * capabilities it was not granted.
 */
export const PERMISSIONS = [
  'application:view_own',
  'application:edit_own',
  'application:view_all',
  'application:view_department',
  'application:review',
  'application:decide', // approve / reject / waitlist
  'application:assign_shift',
  'application:note',
  'application:export',
  'health:view', // restricted health information
  'volunteer:message',
  'announcement:manage',
  'department:manage',
  'question:manage',
  'reference:manage', // countries, regions, provinces, parishes
  'settings:manage',
  'user:manage',
  'audit:view',

  /*
   * Testimony moderation. Contact details are a separate grant from the
   * moderation itself: reading somebody's story is the job, reading their
   * phone number is only needed when replying — and a public-submission inbox
   * is exactly where minimal exposure matters.
   */
  'testimony:moderate',
  'testimony:contact_view',

  /** The public contact inbox — triage, assignment, notes, resolution. */
  'contact:manage',

  // Previous-edition migration. Deliberately separate from the general admin
  // permissions: an import reads thousands of people's personal details and
  // can email all of them, so it is granted explicitly, never by default.
  'migration:view',
  'migration:create',
  'migration:execute',
  'migration:invite',
  'migration:export',
  /*
   * Logging manual follow-up contact with previous participants. Separate from
   * `migration:invite` on purpose: the people phoning through the unresponded
   * list should be able to record what was said without also being able to
   * mass-email fourteen thousand people.
   */
  'migration:followup',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VOLUNTEER: ['application:view_own', 'application:edit_own'],

  SUPER_ADMIN: PERMISSIONS,

  REGISTRATION_ADMIN: [
    'application:view_own',
    'application:edit_own',
    'application:view_all',
    'application:review',
    'application:decide',
    'application:assign_shift',
    'application:note',
    'application:export',
    'volunteer:message',
    'announcement:manage',
    'department:manage',
    'question:manage',
    'reference:manage',
    'settings:manage',
    'audit:view',
    'testimony:moderate',
    'testimony:contact_view',
    'contact:manage',
    // View only. Creating, running and emailing a migration are granted
    // explicitly to the people who do that work. Logging follow-up calls is
    // part of coordinating registrations, so it comes with the role.
    'migration:view',
    'migration:followup',
  ],

  // Sees only applications for departments they are scoped to.
  DEPARTMENT_HEAD: [
    'application:view_own',
    'application:edit_own',
    'application:view_department',
    'application:review',
    'application:assign_shift',
    'application:note',
    'application:export',
    'announcement:manage',
  ],

  REVIEWER: ['application:view_own', 'application:edit_own', 'application:view_all', 'application:review', 'application:note'],

  // The only role that may read health information.
  MEDICAL_INFO_OFFICER: ['application:view_own', 'application:edit_own', 'application:view_all', 'health:view', 'application:note'],

  COMMUNICATION_OFFICER: [
    'application:view_own',
    'application:edit_own',
    'application:view_all',
    'volunteer:message',
    'announcement:manage',
    'application:export',
    'testimony:moderate',
    'testimony:contact_view',
    'contact:manage',
  ],
}

export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>()
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) set.add(permission)
  return set
}

/**
 * The effective policy: role defaults, then per-administrator overrides.
 *
 * Overrides are applied *after* roles and can revoke as well as grant, which is
 * what lets one reviewer be given export rights, or one department head have
 * theirs withdrawn, without inventing a role that exists for a single person
 * and is never maintained afterwards.
 *
 * Pure, and takes the grants as an argument, so the same rule is used by the
 * session loader, by a permission-matrix preview and by the tests.
 */
export function effectivePermissions(
  roles: Role[],
  overrides: { permission: string; granted: boolean }[] = [],
): Set<Permission> {
  const set = permissionsFor(roles)
  for (const override of overrides) {
    // Ignore anything that is no longer a known permission — a renamed key must
    // never silently grant something adjacent.
    if (!(PERMISSIONS as readonly string[]).includes(override.permission)) continue
    const permission = override.permission as Permission
    if (override.granted) set.add(permission)
    else set.delete(permission)
  }
  return set
}

/**
 * Is administrative access currently withdrawn?
 *
 * Distinct from `isActive`, which disables the whole account. A suspended
 * administrator keeps their volunteer application and their dashboard; they
 * simply cannot act as an administrator until the suspension lapses or is
 * lifted.
 */
export function adminAccessSuspended(
  user: Pick<SessionUser, 'adminDisabledAt' | 'adminSuspendedUntil'> | null,
  now: Date = new Date(),
): boolean {
  if (!user) return true
  if (user.adminDisabledAt) return true
  if (user.adminSuspendedUntil && user.adminSuspendedUntil.getTime() > now.getTime()) return true
  return false
}

export function can(
  user: Pick<SessionUser, 'roles' | 'permissionOverrides' | 'adminDisabledAt' | 'adminSuspendedUntil'> | null,
  permission: Permission,
): boolean {
  if (!user) return false

  /*
   * A suspended administrator keeps only what a volunteer has. Checking here
   * rather than at each call site means a route added later cannot forget it —
   * `can` is the single gate every page and action already goes through.
   */
  if (adminAccessSuspended(user)) {
    return permissionsFor(['VOLUNTEER']).has(permission)
  }

  return effectivePermissions(user.roles, user.permissionOverrides ?? []).has(permission)
}

export function isAdmin(
  user: Pick<SessionUser, 'roles' | 'adminDisabledAt' | 'adminSuspendedUntil'> | null,
): boolean {
  if (!user) return false
  if (adminAccessSuspended(user)) return false
  return user.roles.some((role) => role !== 'VOLUNTEER')
}

/** True when the roles exist but access is currently withdrawn. */
export function isSuspendedAdmin(
  user: Pick<SessionUser, 'roles' | 'adminDisabledAt' | 'adminSuspendedUntil'> | null,
): boolean {
  if (!user) return false
  return user.roles.some((role) => role !== 'VOLUNTEER') && adminAccessSuspended(user)
}

/**
 * Departments this user may act on.
 * `null` means "all departments" (no scoping restriction).
 */
export function departmentScope(user: SessionUser): string[] | null {
  if (can(user, 'application:view_all')) return null
  if (can(user, 'application:view_department')) return user.departmentScopes
  return []
}

// --- Guards ---------------------------------------------------------------

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.emailVerified) redirect('/verify-email')
  return user
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser()
  if (!can(user, permission)) redirect('/dashboard?denied=1')
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!isAdmin(user)) redirect('/dashboard?denied=1')
  return user
}
