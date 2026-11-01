-- CreateEnum
CREATE TYPE "PurchasePlatform" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "Purchase" (
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" "PurchasePlatform" NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("transactionId")
);

-- CreateIndex
CREATE INDEX "Purchase_accountId_idx" ON "Purchase"("accountId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
