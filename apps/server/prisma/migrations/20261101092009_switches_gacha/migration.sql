-- CreateEnum
CREATE TYPE "SwitchKind" AS ENUM ('sound', 'effect');

-- CreateEnum
CREATE TYPE "SwitchGrade" AS ENUM ('common', 'rare', 'epic', 'legend');

-- CreateTable
CREATE TABLE "Switch" (
    "id" TEXT NOT NULL,
    "kind" "SwitchKind" NOT NULL,
    "grade" "SwitchGrade" NOT NULL,
    "name" TEXT NOT NULL,
    "assetJson" JSONB NOT NULL,

    CONSTRAINT "Switch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnedSwitch" (
    "accountId" TEXT NOT NULL,
    "switchId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnedSwitch_pkey" PRIMARY KEY ("accountId","switchId")
);

-- CreateTable
CREATE TABLE "GachaPull" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "switchId" TEXT NOT NULL,
    "duplicate" BOOLEAN NOT NULL,
    "refund" INTEGER NOT NULL,
    "shardsAfter" INTEGER NOT NULL,
    "pityAfter" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GachaPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GachaPull_requestId_key" ON "GachaPull"("requestId");

-- CreateIndex
CREATE INDEX "GachaPull_accountId_createdAt_idx" ON "GachaPull"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "OwnedSwitch" ADD CONSTRAINT "OwnedSwitch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedSwitch" ADD CONSTRAINT "OwnedSwitch_switchId_fkey" FOREIGN KEY ("switchId") REFERENCES "Switch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GachaPull" ADD CONSTRAINT "GachaPull_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GachaPull" ADD CONSTRAINT "GachaPull_switchId_fkey" FOREIGN KEY ("switchId") REFERENCES "Switch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
