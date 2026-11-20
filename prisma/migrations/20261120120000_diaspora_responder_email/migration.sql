-- The diaspora form now asks for the responder's own email, emails them a copy,
-- and allows one response per responder email per edition.
-- Both columns are nullable: the responses already stored never asked, and
-- Postgres treats NULLs as distinct, so they never collide with the new rule.

-- AlterTable
ALTER TABLE "diaspora_submissions" ADD COLUMN     "responderEmail" TEXT,
ADD COLUMN     "responderEmailKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "diaspora_submissions_edition_responderEmailKey_key" ON "diaspora_submissions"("edition", "responderEmailKey");

