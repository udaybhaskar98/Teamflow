-- CreateTable
CREATE TABLE "task"."Board" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task"."BoardColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "task"."TaskStatus" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task"."BoardItem" (
    "id" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task"."Comment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task"."Attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Board_projectId_key" ON "task"."Board"("projectId");
CREATE INDEX "BoardColumn_boardId_position_idx" ON "task"."BoardColumn"("boardId", "position");
CREATE UNIQUE INDEX "BoardColumn_boardId_status_key" ON "task"."BoardColumn"("boardId", "status");
CREATE UNIQUE INDEX "BoardItem_taskId_key" ON "task"."BoardItem"("taskId");
CREATE INDEX "BoardItem_columnId_position_idx" ON "task"."BoardItem"("columnId", "position");
CREATE INDEX "Comment_taskId_createdAt_idx" ON "task"."Comment"("taskId", "createdAt");
CREATE INDEX "Comment_projectId_idx" ON "task"."Comment"("projectId");
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "task"."Attachment"("storedName");
CREATE INDEX "Attachment_taskId_createdAt_idx" ON "task"."Attachment"("taskId", "createdAt");
CREATE INDEX "Attachment_projectId_idx" ON "task"."Attachment"("projectId");

-- AddForeignKey
ALTER TABLE "task"."BoardColumn" ADD CONSTRAINT "BoardColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "task"."Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task"."BoardItem" ADD CONSTRAINT "BoardItem_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "task"."BoardColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
