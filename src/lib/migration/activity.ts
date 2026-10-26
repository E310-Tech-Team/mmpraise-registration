import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

/**
 * Milestones in a previous participant's return, recorded without rewriting
 * anything else.
 *
 * The old activation path set `invitationStatus = 'SUPPRESSED'` alongside
 * `activatedAt`, which destroyed the SENT/FAILED history and made activated
 * people show as "Excluded" in every report. Activation is its own fact with
 * its own column; the invitation pipeline's state is left alone.
 */

/** The person completed a password reset — their migrated account now works. */
export async function recordMigratedActivation(userId: string): Promise<void> {
  await db.migratedUserRecord.updateMany({
    where: { matchedUserId: userId, activatedAt: null },
    // activatedAt on a MATCH_EXISTING row simply means "this person responded";
    // it is harmless there and keeps the person-level rollup one query.
    data: { activatedAt: new Date() },
  })
}

/**
 * The person walked their prefilled details and submitted — the profile
 * review the invitation email promises. Recorded at wizard submission, the
 * one point where every step was demonstrably seen.
 */
export async function recordProfileReviewed(userId: string): Promise<void> {
  const now = new Date()
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { profileReviewedAt: now, mustReviewProfile: false },
    }),
    db.migratedUserRecord.updateMany({
      where: { matchedUserId: userId, profileReviewedAt: null },
      data: { profileReviewedAt: now },
    }),
  ])
  await audit({
    action: 'migration.profile_reviewed',
    entityType: 'User',
    entityId: userId,
    actorId: userId,
  })
}
