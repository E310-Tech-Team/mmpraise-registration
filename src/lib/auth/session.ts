import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { db } from '@/lib/db'
import type { Role } from '@/generated/prisma/enums'
import { env, isProduction } from '@/lib/env'
import { generateToken, hashToken } from './tokens'

export type SessionUser = {
  id: string
  email: string
  username: string
  roles: Role[]
  emailVerified: boolean
  departmentScopes: string[]
  firstName: string | null
  lastName: string | null
  photoDocumentId: string | null

  /**
   * Per-administrator additions to, and withdrawals from, the role defaults.
   *
   * Loaded with the session so `can()` stays synchronous — it is called dozens
   * of times per render, and an async permission check would either become a
   * per-call query or a cache nobody remembers to invalidate.
   */
  permissionOverrides: { permission: string; granted: boolean }[]
  /** Administrative access withdrawn indefinitely. */
  adminDisabledAt: Date | null
  /** Administrative access withdrawn until this moment, then restored. */
  adminSuspendedUntil: Date | null
}

const COOKIE = env.SESSION_COOKIE_NAME

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires,
  }
}

/** Issue a new session and set the cookie. Returns the session id. */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000)
  const headerList = await headers()

  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: clientIp(headerList),
      userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
    },
  })

  const jar = await cookies()
  jar.set(COOKIE, token, cookieOptions(expiresAt))
  return session.id
}

/** Revoke the current session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    await db.session
      .updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined)
  }
  jar.delete(COOKIE)
}

/** Revoke every session for a user — used after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
}

/**
 * Resolve the signed-in user for this request.
 * Wrapped in React's `cache` so repeated calls within one render hit the database once.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  try {
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: {
            roles: true,
            departmentScopes: { select: { departmentId: true } },
            permissionGrants: { select: { permission: true, granted: true } },
            profile: { select: { firstName: true, lastName: true, photoDocumentId: true } },
          },
        },
      },
    })

    if (!session || session.revokedAt || session.expiresAt < new Date()) return null
    if (!session.user.isActive) return null

    return {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      roles: session.user.roles.map((r) => r.role),
      emailVerified: Boolean(session.user.emailVerifiedAt),
      departmentScopes: session.user.departmentScopes.map((s) => s.departmentId),
      firstName: session.user.profile?.firstName ?? null,
      lastName: session.user.profile?.lastName ?? null,
      photoDocumentId: session.user.profile?.photoDocumentId ?? null,
      permissionOverrides: session.user.permissionGrants.map((g) => ({
        permission: g.permission,
        granted: g.granted,
      })),
      adminDisabledAt: session.user.adminDisabledAt,
      adminSuspendedUntil: session.user.adminSuspendedUntil,
    }
  } catch {
    return null
  }
})

/** Remove expired and long-revoked sessions. Called opportunistically on login. */
export async function pruneSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000)
  await db.session
    .deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] } })
    .catch(() => undefined)
}

export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim().slice(0, 45)
  return headerList.get('x-real-ip')?.slice(0, 45) ?? null
}
