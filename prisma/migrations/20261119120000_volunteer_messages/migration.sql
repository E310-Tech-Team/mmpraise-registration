-- Direct messages from the volunteer team to volunteers (dashboard inbox).
-- Two new tables; no existing table or row is touched.

-- CreateTable
CREATE TABLE "volunteer_messages" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderId" TEXT,
    "audience" TEXT NOT NULL,
    "filters" JSONB,
    "recipientCount" INTEGER NOT NULL,
    "emailRequested" BOOLEAN NOT NULL DEFAULT false,
    "emailSucceeded" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "emailFailures" JSONB,
    "emailCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_message_recipients" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_messages_createdAt_idx" ON "volunteer_messages"("createdAt");

-- CreateIndex
CREATE INDEX "volunteer_message_recipients_userId_readAt_idx" ON "volunteer_message_recipients"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_message_recipients_messageId_userId_key" ON "volunteer_message_recipients"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "volunteer_messages" ADD CONSTRAINT "volunteer_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_message_recipients" ADD CONSTRAINT "volunteer_message_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "volunteer_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_message_recipients" ADD CONSTRAINT "volunteer_message_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

