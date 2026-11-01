-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('not_required', 'pending', 'granted');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "linkedProviders" TEXT[],
    "birthDate" DATE,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'not_required',
    "storageSlots" INTEGER NOT NULL DEFAULT 6,
    "shards" INTEGER NOT NULL DEFAULT 0,
    "pityCounter" INTEGER NOT NULL DEFAULT 0,
    "uploadRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_firebaseUid_key" ON "Account"("firebaseUid");
