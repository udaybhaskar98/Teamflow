-- CreateTable
CREATE TABLE "auth"."Profile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "title" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "auth"."Profile"("email");

-- Backfill profiles for accounts that existed before this migration.
INSERT INTO "auth"."Profile" ("id", "email", "name", "createdAt", "updatedAt")
SELECT "id", "email", "name", "createdAt", "updatedAt" FROM "auth"."User"
ON CONFLICT ("email") DO NOTHING;
