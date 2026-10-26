import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { clientIp } from '@/lib/auth/session'

/**
 * Append-only audit trail.
 *
 * Every privileged or security-relevant action records who did what to which
 * entity. Writes are best-effort: an audit failure must never take down the
 * user-facing operation, but it is logged loudly to the server console.
 */
/**
 * Every action the system can record, as runtime data.
 *
 * An array rather than a bare union so the activity log can enumerate it —
 * that is what lets a test prove every action has a human-readable label,
 * instead of discovering the gap when a row renders as a raw code.
 */
export const AUDIT_ACTIONS = [
  'auth.register',
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.email_verified',
  'auth.password_reset_requested',
  'auth.password_reset',
  'auth.password_changed',
  'application.draft_saved',
  'application.submitted',
  'application.updated',
  'application.status_changed',
  'application.note_added',
  'application.exported',
  'application.contacts_exported',
  'application.shift_assigned',
  'health.viewed',
  'document.uploaded',
  'document.downloaded',
  'announcement.created',
  'announcement.updated',
  'announcement.published',
  'announcement.scheduled',
  'announcement.expired',
  'announcement.archived',
  'announcement.cloned',
  /** One email run — real or test; `metadata.isTest` says which. */
  'announcement.emailed',
  'department.updated',
  'question.updated',
  'reference.updated',
  'testimony.moderated',
  'testimony.contact_viewed',
  'contact.triaged',
  'settings.updated',
  'user.role_changed',
  'user.deletion_requested',

  /*
   * Previous-edition migration.
   *
   * Every one of these is security-sensitive: a batch is a list of thousands of
   * people's personal details, an import creates accounts, and an invitation
   * run emails all of them. They are named individually rather than folded into
   * a generic "migration.updated" so the Activity Log can say what actually
   * happened without anyone having to read the metadata.
   */
  'migration.batch_created',
  'migration.batch_validated',
  'migration.row_created',
  'migration.row_matched',
  'migration.import_queued',
  'migration.batch_cancelled',
  'migration.rows_retried',
  'migration.invitations_queued',
  'migration.invitations_sent',
  'migration.exported',
  'migration.upload_purged',

  /*
   * Previous-participant follow-up and outreach. Contact logs are personal
   * data about reluctance and reachability; reminder runs email people in
   * bulk. Both belong in the security view.
   */
  'migration.contact_logged',
  'migration.contacts_bulk_logged',
  'migration.reminder_run_created',
  'migration.reminder_run_cancelled',
  'migration.outreach_completed',
  'migration.profile_reviewed',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export async function audit(params: {
  action: AuditAction
  entityType: string
  entityId?: string | null
  actorId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const headerList = await headers()
    await db.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        actorId: params.actorId ?? null,
        metadata: (params.metadata ?? {}) as never,
        ip: clientIp(headerList),
        userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to record', params.action, error)
  }
}
