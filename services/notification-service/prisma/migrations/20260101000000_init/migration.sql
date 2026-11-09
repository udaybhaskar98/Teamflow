-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notification";

-- CreateTable
CREATE TABLE "notification"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "eventId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_userId_key" ON "notification"."Notification"("eventId", "userId");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "notification"."Notification"("userId", "readAt", "createdAt");
