import type { AuditAction } from '@/lib/audit'

/**
 * Human-readable descriptions of audit actions.
 *
 * The log held 2,261 rows of `application.exported` and raw JSON: technically
 * complete, operationally unreadable. Somebody asking "who exported volunteer
 * data last week?" should not have to know the vocabulary, so every action gets
 * a sentence, a category to filter by, and a mark saying whether it is one of
 * the entries a compliance review actually cares about.
 *
 * A missing entry is not an error — an action added later still renders, using
 * its code. That is deliberate: the log must never hide a row because nobody
 * has written a label for it yet.
 */
export type AuditCategory =
  | 'access'
  | 'applications'
  | 'people'
  | 'content'
  | 'configuration'
  | 'migration'

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  access: 'Sign-in and access',
  applications: 'Applications',
  people: 'People and permissions',
  content: 'Content and messages',
  configuration: 'Configuration',
  migration: 'Previous-edition migration',
}

type Descriptor = {
  /** Verb phrase completing "<Actor> …". */
  label: string
  category: AuditCategory
  /**
   * Belongs in the security and compliance view: reading personal data,
   * changing who can do what, or anything touching thousands of records.
   */
  security?: boolean
}

const DESCRIPTORS: Partial<Record<AuditAction, Descriptor>> = {
  'auth.register': { label: 'created an account', category: 'access' },
  'auth.login': { label: 'signed in', category: 'access' },
  'auth.login_failed': { label: 'failed to sign in', category: 'access', security: true },
  'auth.logout': { label: 'signed out', category: 'access' },
  'auth.email_verified': { label: 'verified their email address', category: 'access' },
  'auth.password_reset_requested': {
    label: 'asked for a password reset',
    category: 'access',
    security: true,
  },
  'auth.password_reset': { label: 'reset their password', category: 'access', security: true },
  'auth.password_changed': { label: 'changed their password', category: 'access', security: true },

  'application.draft_saved': { label: 'saved a draft application', category: 'applications' },
  'application.submitted': { label: 'submitted an application', category: 'applications' },
  'application.updated': { label: 'edited an application', category: 'applications' },
  'application.status_changed': { label: 'changed an application’s status', category: 'applications' },
  'application.note_added': { label: 'added a note to an application', category: 'applications' },
  'application.exported': {
    label: 'exported volunteer applications',
    category: 'applications',
    security: true,
  },
  'application.contacts_exported': {
    label: 'downloaded a volunteer contact list',
    category: 'applications',
    security: true,
  },
  'application.shift_assigned': { label: 'assigned a shift', category: 'applications' },

  'health.viewed': {
    label: 'viewed declared health information',
    category: 'applications',
    security: true,
  },
  'document.uploaded': { label: 'uploaded a document', category: 'applications' },
  'document.downloaded': {
    label: 'downloaded a volunteer’s document',
    category: 'applications',
    security: true,
  },

  'announcement.created': { label: 'drafted an announcement', category: 'content' },
  'announcement.updated': { label: 'edited an announcement', category: 'content' },
  'announcement.published': { label: 'published an announcement', category: 'content' },
  'announcement.scheduled': { label: 'scheduled an announcement', category: 'content' },
  'announcement.expired': { label: 'took an announcement down', category: 'content' },
  'announcement.archived': { label: 'archived an announcement', category: 'content' },
  'announcement.cloned': { label: 'copied an announcement', category: 'content' },
  'announcement.emailed': {
    label: 'emailed an announcement to volunteers',
    category: 'content',
    security: true,
  },

  'testimony.moderated': { label: 'moderated a praise report', category: 'content' },
  'testimony.contact_viewed': {
    label: 'viewed a praise report’s contact details',
    category: 'content',
    security: true,
  },
  'contact.triaged': { label: 'triaged a contact message', category: 'content' },

  'department.updated': { label: 'changed a department', category: 'configuration' },
  'question.updated': { label: 'changed a department question', category: 'configuration' },
  'reference.updated': { label: 'changed reference data', category: 'configuration' },
  'settings.updated': { label: 'changed system settings', category: 'configuration', security: true },

  'user.role_changed': {
    label: 'changed someone’s roles or permissions',
    category: 'people',
    security: true,
  },
  'user.deletion_requested': {
    label: 'requested account deletion',
    category: 'people',
    security: true,
  },

  'migration.batch_created': { label: 'started a migration batch', category: 'migration', security: true },
  'migration.batch_validated': { label: 'validated a migration batch', category: 'migration' },
  'migration.row_created': { label: 'created an account from migration data', category: 'migration', security: true },
  'migration.row_matched': { label: 'matched a migration row to an account', category: 'migration' },
  'migration.import_queued': { label: 'queued a migration import', category: 'migration', security: true },
  'migration.batch_cancelled': { label: 'cancelled a migration batch', category: 'migration' },
  'migration.rows_retried': { label: 'retried failed migration rows', category: 'migration' },
  'migration.invitations_queued': { label: 'queued migration invitations', category: 'migration', security: true },
  'migration.invitations_sent': { label: 'emailed migration invitations', category: 'migration', security: true },
  'migration.exported': { label: 'exported migration data', category: 'migration', security: true },
  'migration.upload_purged': { label: 'purged a migration upload', category: 'migration' },
  'migration.contact_logged': {
    label: 'logged contact with a previous participant',
    category: 'migration',
    security: true,
  },
  'migration.contacts_bulk_logged': {
    label: 'logged contact with several previous participants',
    category: 'migration',
    security: true,
  },
  'migration.reminder_run_created': {
    label: 'started a reminder email run',
    category: 'migration',
    security: true,
  },
  'migration.reminder_run_cancelled': {
    label: 'cancelled a reminder email run',
    category: 'migration',
  },
  'migration.outreach_completed': {
    label: 'finished an outreach email run',
    category: 'migration',
    security: true,
  },
  'migration.profile_reviewed': {
    label: 'reviewed their migrated profile',
    category: 'migration',
  },
}

export function describeAction(action: string): Descriptor {
  return (
    DESCRIPTORS[action as AuditAction] ?? {
      // Readable enough to act on, and honest that it has no label yet.
      label: action.replace(/[._]/g, ' '),
      category: 'configuration',
    }
  )
}

/** Every action in one category — used to turn a category filter into a query. */
export function actionsInCategory(category: AuditCategory): string[] {
  return Object.entries(DESCRIPTORS)
    .filter(([, descriptor]) => descriptor.category === category)
    .map(([action]) => action)
}

/** Every action a compliance review cares about. */
export function securityActions(): string[] {
  return Object.entries(DESCRIPTORS)
    .filter(([, descriptor]) => descriptor.security)
    .map(([action]) => action)
}

/**
 * The full sentence for one entry: "Super Admin exported volunteer
 * applications (98 rows)".
 *
 * The parenthetical comes from whichever metadata keys are worth reading. It is
 * a whitelist rather than a dump — metadata carries reasons and counts that are
 * useful, and ids and internal flags that are not.
 */
const INTERESTING_KEYS = [
  'count',
  'rows',
  'recipients',
  'approved',
  'resolved',
  'succeeded',
  'failed',
  'status',
  'from',
  'to',
  'reason',
  'permission',
  'state',
  'access',
  'isTest',
  'retired',
  'restored',
] as const

export function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const record = metadata as Record<string, unknown>

  const parts: string[] = []
  for (const key of INTERESTING_KEYS) {
    const value = record[key]
    if (value === undefined || value === null || value === false || value === '') continue
    parts.push(`${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${String(value)}`)
  }
  return parts.length ? parts.join(', ') : null
}
