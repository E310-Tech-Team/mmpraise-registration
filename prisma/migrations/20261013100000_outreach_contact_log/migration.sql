-- Outreach subsystem and manual follow-up log.
--
-- Every bulk email to participants (migration invitations included) becomes an
-- auditable run with per-recipient attempts, replacing the invite jobs whose
-- offset arithmetic stranded rows. Pure DDL — backfills live in the two
-- migrations that follow, so a backfill problem can never block the schema.

CREATE TYPE "OutreachKind" AS ENUM ('INVITATION', 'REMINDER_UNACTIVATED', 'REMINDER_UNCONFIRMED');
CREATE TYPE "OutreachRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED');
CREATE TYPE "OutreachAttemptStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "ContactChannel" AS ENUM ('PHONE', 'WHATSAPP', 'SMS', 'EMAIL', 'IN_PERSON', 'OTHER');
CREATE TYPE "ContactOutcome" AS ENUM ('AWAITING_RESPONSE', 'NEEDS_ASSISTANCE', 'DECLINED', 'UNREACHABLE', 'RESOLVED');

CREATE TABLE "outreach_runs" (
  "id"            TEXT NOT NULL,
  "kind"          "OutreachKind" NOT NULL,
  "edition"       TEXT NOT NULL,
  "templateKey"   TEXT NOT NULL,
  "batchId"       TEXT,
  "filtersJson"   JSONB,
  "cooldownDays"  INTEGER NOT NULL DEFAULT 7,
  "maxRecipients" INTEGER NOT NULL DEFAULT 500,
  "plannedCount"  INTEGER NOT NULL DEFAULT 0,
  "sentCount"     INTEGER NOT NULL DEFAULT 0,
  "failedCount"   INTEGER NOT NULL DEFAULT 0,
  "skippedCount"  INTEGER NOT NULL DEFAULT 0,
  "mailerMode"    TEXT NOT NULL,
  "status"        "OutreachRunStatus" NOT NULL DEFAULT 'QUEUED',
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"     TIMESTAMP(3),
  "completedAt"   TIMESTAMP(3),
  CONSTRAINT "outreach_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outreach_runs_kind_createdAt_idx" ON "outreach_runs"("kind", "createdAt");
CREATE INDEX "outreach_runs_status_idx" ON "outreach_runs"("status");
ALTER TABLE "outreach_runs"
  ADD CONSTRAINT "outreach_runs_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outreach_runs"
  ADD CONSTRAINT "outreach_runs_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "outreach_attempts" (
  "id"         TEXT NOT NULL,
  "runId"      TEXT NOT NULL,
  "userId"     TEXT,
  "recordId"   TEXT,
  "email"      TEXT NOT NULL,
  "kind"       "OutreachKind" NOT NULL,
  "status"     "OutreachAttemptStatus" NOT NULL DEFAULT 'QUEUED',
  "error"      TEXT,
  "mailerMode" TEXT,
  "queuedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt"  TIMESTAMP(3),
  "sentAt"     TIMESTAMP(3),
  "dedupeKey"  TEXT NOT NULL,
  CONSTRAINT "outreach_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outreach_attempts_dedupeKey_key" ON "outreach_attempts"("dedupeKey");
CREATE INDEX "outreach_attempts_userId_status_sentAt_idx" ON "outreach_attempts"("userId", "status", "sentAt");
CREATE INDEX "outreach_attempts_runId_status_idx" ON "outreach_attempts"("runId", "status");
ALTER TABLE "outreach_attempts"
  ADD CONSTRAINT "outreach_attempts_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "outreach_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreach_attempts"
  ADD CONSTRAINT "outreach_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outreach_attempts"
  ADD CONSTRAINT "outreach_attempts_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "migrated_user_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "outreach_jobs" (
  "id"          TEXT NOT NULL,
  "runId"       TEXT NOT NULL,
  "seq"         INTEGER NOT NULL,
  "status"      "JobStatus" NOT NULL DEFAULT 'PENDING',
  "size"        INTEGER NOT NULL DEFAULT 50,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastError"   TEXT,
  "claimedAt"   TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outreach_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outreach_jobs_runId_seq_key" ON "outreach_jobs"("runId", "seq");
CREATE INDEX "outreach_jobs_status_createdAt_idx" ON "outreach_jobs"("status", "createdAt");
ALTER TABLE "outreach_jobs"
  ADD CONSTRAINT "outreach_jobs_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "outreach_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "participant_contact_logs" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "adminId"        TEXT,
  "channel"        "ContactChannel" NOT NULL,
  "outcome"        "ContactOutcome" NOT NULL,
  "notes"          TEXT,
  "contactedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextFollowUpAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "participant_contact_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "participant_contact_logs_userId_contactedAt_idx" ON "participant_contact_logs"("userId", "contactedAt" DESC);
CREATE INDEX "participant_contact_logs_nextFollowUpAt_idx" ON "participant_contact_logs"("nextFollowUpAt");
ALTER TABLE "participant_contact_logs"
  ADD CONSTRAINT "participant_contact_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participant_contact_logs"
  ADD CONSTRAINT "participant_contact_logs_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One-shot guard for the upload-time "send invitations" choice.
ALTER TABLE "migration_batches" ADD COLUMN "invitationsAutoQueuedAt" TIMESTAMP(3);

-- Person-level joins and stage scans at 14k scale.
CREATE INDEX "migrated_user_records_matchedUserId_idx" ON "migrated_user_records"("matchedUserId");
CREATE INDEX "users_isPreviousEditionUser_emailVerifiedAt_idx" ON "users"("isPreviousEditionUser", "emailVerifiedAt");
CREATE INDEX "edition_participations_edition_confirmedAt_idx" ON "edition_participations"("edition", "confirmedAt");
