-- CreateEnum
CREATE TYPE "InventorySource" AS ENUM ('created', 'received', 'original');

-- CreateTable
CREATE TABLE "Clicker" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idleKey" TEXT NOT NULL,
    "pressedKey" TEXT,
    "specJson" JSONB NOT NULL,
    "faceDetected" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedByCreator" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clicker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clickerId" TEXT NOT NULL,
    "source" "InventorySource" NOT NULL,
    "receivedVersion" INTEGER,
    "soundSwitchId" TEXT,
    "effectSwitchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clicker_creatorId_idx" ON "Clicker"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_accountId_clickerId_key" ON "InventoryItem"("accountId", "clickerId");

-- AddForeignKey
ALTER TABLE "Clicker" ADD CONSTRAINT "Clicker_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_clickerId_fkey" FOREIGN KEY ("clickerId") REFERENCES "Clicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
