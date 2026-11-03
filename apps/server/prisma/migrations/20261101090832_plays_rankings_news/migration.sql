-- CreateEnum
CREATE TYPE "PlayMode" AS ENUM ('free', 'timed10');

-- CreateEnum
CREATE TYPE "NewsType" AS ENUM ('friend_record', 'received');

-- CreateTable
CREATE TABLE "PlayRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clickerId" TEXT NOT NULL,
    "mode" "PlayMode" NOT NULL,
    "score" INTEGER NOT NULL,
    "maxCombo" INTEGER NOT NULL,
    "taps" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickerStat" (
    "accountId" TEXT NOT NULL,
    "clickerId" TEXT NOT NULL,
    "bestScore" INTEGER NOT NULL,
    "bestCombo" INTEGER NOT NULL,
    "totalTaps" INTEGER NOT NULL,

    CONSTRAINT "ClickerStat_pkey" PRIMARY KEY ("accountId","clickerId")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NewsType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayRecord_accountId_playedAt_idx" ON "PlayRecord"("accountId", "playedAt");

-- CreateIndex
CREATE INDEX "PlayRecord_clickerId_playedAt_idx" ON "PlayRecord"("clickerId", "playedAt");

-- CreateIndex
CREATE INDEX "NewsItem_recipientId_createdAt_idx" ON "NewsItem"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayRecord" ADD CONSTRAINT "PlayRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayRecord" ADD CONSTRAINT "PlayRecord_clickerId_fkey" FOREIGN KEY ("clickerId") REFERENCES "Clicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickerStat" ADD CONSTRAINT "ClickerStat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickerStat" ADD CONSTRAINT "ClickerStat_clickerId_fkey" FOREIGN KEY ("clickerId") REFERENCES "Clicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
