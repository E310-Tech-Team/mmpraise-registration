-- Repair invitation history that activation destroyed.
--
-- Activation used to overwrite invitationStatus with SUPPRESSED, erasing the
-- SENT/FAILED distinction and making activated people show as "Excluded".
-- From this release, invitationStatus is purely pipeline state
-- (NOT_QUEUED | QUEUED | SENT | FAILED); exclusion lives in
-- excludedFromInvites and activation in activatedAt. SUPPRESSED stays in the
-- enum (removing a value is not additive) but nothing writes it any more.
--
-- What can and cannot be restored, honestly:
--   * invitationSentKey is set as a claim before sending and RELEASED on
--     failure, so a non-null key proves a successful send happened. Those rows
--     are restored to SENT.
--   * Rows with no key were never successfully sent; they return to
--     NOT_QUEUED. If an admin had excluded them, excludedFromInvites already
--     says so — same meaning, cleaner encoding.
--   * NOT restorable, reported as "not tracked" in the UI, never fabricated:
--     how many failed attempts preceded a success, and invitedAt values that
--     past failures nulled.

UPDATE "migrated_user_records"
SET "invitationStatus" = 'SENT'
WHERE "invitationSentKey" IS NOT NULL AND "invitationStatus" = 'SUPPRESSED';

UPDATE "migrated_user_records"
SET "invitationStatus" = 'NOT_QUEUED'
WHERE "invitationSentKey" IS NULL AND "invitationStatus" = 'SUPPRESSED';

-- Rows stranded QUEUED by the retired invite-job pipeline (jobs were created
-- per 100 rows, workers processed 50 and ignored the offset; re-queues
-- collided on job keys and created nothing). They were never claimed —
-- invitationSentKey is null — so they return to NOT_QUEUED and the next
-- "Invite" click picks them up through the outreach pipeline.
UPDATE "migrated_user_records"
SET "invitationStatus" = 'NOT_QUEUED'
WHERE "invitationStatus" = 'QUEUED' AND "invitationSentKey" IS NULL;

-- A row can be QUEUED with a key only if the old worker crashed between its
-- claim and its status write. The key rule (key => a send happened) is applied
-- here too, for the same reason as above: the claim was immediately followed
-- by the send, and a key was released on any failure the code could observe.
UPDATE "migrated_user_records"
SET "invitationStatus" = 'SENT'
WHERE "invitationStatus" = 'QUEUED' AND "invitationSentKey" IS NOT NULL;

-- The auto-queue honouring the upload-time checkbox must never fire
-- retroactively on historical batches: mark them as already handled.
UPDATE "migration_batches"
SET "invitationsAutoQueuedAt" = CURRENT_TIMESTAMP
WHERE "sendInvitations" = true;

-- Retire the legacy invite jobs; their worker branch is deleted in the same
-- release, so any straggler would be a no-op anyway.
UPDATE "import_jobs"
SET "status" = 'CANCELLED', "completedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'invite' AND "status" IN ('PENDING', 'RUNNING');
