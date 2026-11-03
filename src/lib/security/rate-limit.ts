import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { clientIp } from '@/lib/auth/session'

/**
 * Fixed-window rate limiting backed by the database.
 *
 * A database counter is used rather than in-memory state because the app is
 * expected to run behind more than one instance, where per-process counters
 * would multiply the effective limit by the instance count. Redis would be
 * faster; Postgres keeps the deployment to a single dependency and these limits
 * guard low-frequency endpoints (login, register, password reset).
 */
export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export async function rateLimit(
  key: string,
  max: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  try {
    const now = new Date()
    const windowMs = windowMinutes * 60_000

    const existing = await db.rateLimitBucket.findUnique({ where: { key } })

    // No bucket, or the previous window has elapsed: start a fresh window.
    if (!existing || existing.expiresAt <= now) {
      await db.rateLimitBucket.upsert({
        where: { key },
        update: { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) },
        create: { key, count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) },
      })
      return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 }
    }

    if (existing.count >= max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000)),
      }
    }

    const updated = await db.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    })

    return { allowed: true, remaining: Math.max(0, max - updated.count), retryAfterSeconds: 0 }
  } catch (error) {
    // In dev / before migrations run, don't crash on missing rate-limit tables
    return { allowed: true, remaining: max, retryAfterSeconds: 0 }
  }
}

/** Build a rate-limit key scoped to the caller's IP address. */
export async function ipKey(action: string): Promise<string> {
  const headerList = await headers()
  return `${action}:ip:${clientIp(headerList) ?? 'unknown'}`
}

/** Build a rate-limit key scoped to an identifier such as an email address. */
export function identifierKey(action: string, identifier: string): string {
  return `${action}:id:${identifier.toLowerCase()}`
}

/** Housekeeping: drop expired buckets. */
export async function pruneRateLimits(): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined)
}
