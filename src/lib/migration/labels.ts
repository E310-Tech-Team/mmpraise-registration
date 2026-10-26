import type {
  InvitationStatus,
  MigrationBatchStatus,
  MigrationRowAction,
  MigrationRowStatus,
} from '@/generated/prisma/enums'

/**
 * Human wording for the migration enums.
 *
 * Free of `server-only` imports: the batch screens are Client Components so
 * they can poll progress, and importing the service module there would pull the
 * database client into the browser bundle.
 *
 * Every label is written for someone who did not design the schema. "COMPLETED_
 * WITH_WARNINGS" is accurate and unreadable; "Finished with problems" is what
 * an administrator needs to see at a glance in a list of twenty batches.
 */

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export const BATCH_STATUS_LABELS: Record<MigrationBatchStatus, string> = {
  DRAFT: 'Not validated',
  VALIDATED: 'Ready to import',
  QUEUED: 'Queued',
  IMPORTING: 'Importing',
  COMPLETED: 'Finished',
  COMPLETED_WITH_WARNINGS: 'Finished with problems',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

export const BATCH_STATUS_TONES: Record<MigrationBatchStatus, Tone> = {
  DRAFT: 'neutral',
  VALIDATED: 'info',
  QUEUED: 'info',
  IMPORTING: 'brand',
  COMPLETED: 'success',
  COMPLETED_WITH_WARNINGS: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}

/** What an administrator should do next, per status. Empty when nothing. */
export const BATCH_NEXT_STEP: Record<MigrationBatchStatus, string> = {
  DRAFT: 'Check the column mapping, then validate to see what would happen.',
  VALIDATED: 'Read the report below, then confirm to import.',
  QUEUED: 'Waiting for the import to start.',
  IMPORTING: 'Importing now. This page updates as rows are processed.',
  COMPLETED: 'Every row imported. You can now send invitations.',
  COMPLETED_WITH_WARNINGS: 'Finished, but some rows did not import. Download the report below.',
  FAILED: 'The import could not run. Retry the failed rows or upload a corrected file.',
  CANCELLED: 'Cancelled. Rows already imported were not undone.',
}

export const ROW_STATUS_LABELS: Record<MigrationRowStatus, string> = {
  PENDING: 'Not checked',
  VALID: 'Ready',
  WARNING: 'Ready, with notes',
  INVALID: 'Cannot import',
  IMPORTED: 'Imported',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
}

export const ROW_STATUS_TONES: Record<MigrationRowStatus, Tone> = {
  PENDING: 'neutral',
  VALID: 'success',
  WARNING: 'warning',
  INVALID: 'danger',
  IMPORTED: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
}

export const ROW_ACTION_LABELS: Record<MigrationRowAction, string> = {
  CREATE: 'New account',
  MATCH_EXISTING: 'Existing account',
  SKIP_DUPLICATE: 'Duplicate in file',
  SKIP_INVALID: 'Not importable',
}

/**
 * Invitation wording.
 *
 * "Sent" and "Delivered" are deliberately different: SMTP acceptance is all the
 * mailer can observe, and only a provider webhook can confirm the rest. Showing
 * both as "Delivered" would mislead whoever is chasing non-responders.
 */
export const INVITATION_LABELS: Record<InvitationStatus, string> = {
  NOT_QUEUED: 'Not invited',
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  BOUNCED: 'Bounced',
  FAILED: 'Failed',
  /*
   * Legacy value: nothing writes SUPPRESSED any more. It used to mean either
   * "an administrator excluded them" or "they activated" — two opposite facts
   * under one word, and the UI picked the wrong one. Exclusion now shows from
   * `excludedFromInvites` and activation from `activatedAt`; any row still
   * carrying this value predates the repair migration.
   */
  SUPPRESSED: 'Suppressed (legacy)',
}

export const INVITATION_TONES: Record<InvitationStatus, Tone> = {
  NOT_QUEUED: 'neutral',
  QUEUED: 'info',
  SENT: 'success',
  DELIVERED: 'success',
  BOUNCED: 'danger',
  FAILED: 'danger',
  SUPPRESSED: 'neutral',
}

/** Statuses where the batch is still moving and the screen should keep polling. */
export function isBatchRunning(status: MigrationBatchStatus): boolean {
  return status === 'QUEUED' || status === 'IMPORTING'
}
