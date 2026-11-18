-- Responses to the public diaspora participation form (diaspora.mmpraise.org).
-- A new, self-contained table: no existing table or row is touched.

-- CreateTable
CREATE TABLE "diaspora_submissions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryPastorName" TEXT NOT NULL,
    "countryPastorEmail" TEXT NOT NULL,
    "countryPastorPhone" TEXT,
    "continentalOverseer" TEXT NOT NULL,
    "centreNameAndLocation" TEXT NOT NULL,
    "centreOfficialEmail" TEXT NOT NULL,
    "picName" TEXT,
    "picEmail" TEXT,
    "picPhone" TEXT,
    "repName" TEXT NOT NULL,
    "repEmail" TEXT NOT NULL,
    "repPhone" TEXT NOT NULL,
    "centreEmailKey" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diaspora_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diaspora_submissions_reference_key" ON "diaspora_submissions"("reference");

-- CreateIndex
CREATE INDEX "diaspora_submissions_edition_createdAt_idx" ON "diaspora_submissions"("edition", "createdAt");

-- CreateIndex
CREATE INDEX "diaspora_submissions_centreEmailKey_idx" ON "diaspora_submissions"("centreEmailKey");

