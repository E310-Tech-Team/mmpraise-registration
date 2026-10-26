-- Backfill the outreach history from what the old pipeline left behind, so
-- the cooldown rule ("no reminder within N days of ANY successful send") can
-- read one table — outreach_attempts — uniformly.
--
-- Source of truth: invitationSentKey. It was claimed before sending and
-- released on failure, so a non-null key is proof of one successful send.
--
-- Stated limitations, also recorded on the synthetic runs' filtersJson:
--   * exactly one attempt per person is reconstructed — failed attempts that
--     preceded the success left no durable trace;
--   * sentAt falls back to the row's updatedAt where invitedAt was nulled by
--     a later failure, so some timestamps are approximate;
--   * mailerMode is recorded as 'unknown' — whether a historical send went
--     through SMTP or to a development mail file was never stored.

INSERT INTO "outreach_runs"
  ("id", "kind", "edition", "templateKey", "batchId", "filtersJson",
   "mailerMode", "status", "plannedCount", "sentCount", "createdAt", "startedAt", "completedAt")
SELECT
  'orb_' || b."id",
  'INVITATION',
  b."sourceEdition",
  'migration_invitation',
  b."id",
  jsonb_build_object(
    'backfill', true,
    'note', 'Reconstructed from invitationSentKey: one attempt per person, no failure history, approximate timestamps.'
  ),
  'unknown',
  'COMPLETED',
  count(r."id"),
  count(r."id"),
  b."createdAt",
  min(COALESCE(r."invitedAt", r."updatedAt")),
  max(COALESCE(r."invitedAt", r."updatedAt"))
FROM "migration_batches" b
JOIN "migrated_user_records" r ON r."batchId" = b."id" AND r."invitationSentKey" IS NOT NULL
GROUP BY b."id";

INSERT INTO "outreach_attempts"
  ("id", "runId", "userId", "recordId", "email", "kind", "status",
   "mailerMode", "queuedAt", "sentAt", "dedupeKey")
SELECT
  'oab_' || r."id",
  'orb_' || r."batchId",
  r."matchedUserId",
  r."id",
  r."normalisedEmail",
  'INVITATION',
  'SENT',
  'unknown',
  COALESCE(r."invitedAt", r."updatedAt"),
  COALESCE(r."invitedAt", r."updatedAt"),
  'orb_' || r."batchId" || ':' || r."id"
FROM "migrated_user_records" r
WHERE r."invitationSentKey" IS NOT NULL;
