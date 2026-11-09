-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "task";

-- CreateEnum
CREATE TYPE "task"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
CREATE TYPE "task"."TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "task"."Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "task"."TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "creatorId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "task"."Task"("projectId", "status");
CREATE INDEX "Task_projectId_assigneeId_idx" ON "task"."Task"("projectId", "assigneeId");
CREATE INDEX "Task_parentTaskId_idx" ON "task"."Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "task"."Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "task"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
