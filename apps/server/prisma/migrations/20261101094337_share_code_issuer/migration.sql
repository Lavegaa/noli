-- AlterTable: 기존 코드는 발급자를 알 수 없으므로 제작자로 채운다.
ALTER TABLE "ShareCode" ADD COLUMN     "issuerId" TEXT;
UPDATE "ShareCode" SET "issuerId" = "creatorId" WHERE "issuerId" IS NULL;
ALTER TABLE "ShareCode" ALTER COLUMN "issuerId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ShareCode" ADD CONSTRAINT "ShareCode_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
