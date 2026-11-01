-- CreateTable
CREATE TABLE "ShareCode" (
    "code" TEXT NOT NULL,
    "clickerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "allowFriend" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "accountA" TEXT NOT NULL,
    "accountB" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("accountA","accountB")
);

-- CreateIndex
CREATE INDEX "ShareCode_clickerId_idx" ON "ShareCode"("clickerId");

-- CreateIndex
CREATE INDEX "Friendship_accountB_idx" ON "Friendship"("accountB");

-- AddForeignKey
ALTER TABLE "ShareCode" ADD CONSTRAINT "ShareCode_clickerId_fkey" FOREIGN KEY ("clickerId") REFERENCES "Clicker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCode" ADD CONSTRAINT "ShareCode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_accountA_fkey" FOREIGN KEY ("accountA") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_accountB_fkey" FOREIGN KEY ("accountB") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
