-- AlterTable
ALTER TABLE "users"."users" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "users"."social_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_accounts_userId_idx" ON "users"."social_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_provider_providerId_key" ON "users"."social_accounts"("provider", "providerId");

-- AddForeignKey
ALTER TABLE "users"."social_accounts" ADD CONSTRAINT "social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
