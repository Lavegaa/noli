-- CreateTable
CREATE TABLE "DailyQuest" (
    "accountId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "questKey" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "reward" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "countedClickerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "DailyQuest_pkey" PRIMARY KEY ("accountId","day","questKey")
);

-- AddForeignKey
ALTER TABLE "DailyQuest" ADD CONSTRAINT "DailyQuest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
