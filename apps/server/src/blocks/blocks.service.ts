import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { sorted } from '../common/pair.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /** 어느 방향이든 차단이면 true. */
  isBlocked(a: string, b: string): Promise<boolean> {
    return this.existsBetween(this.prisma, a, b);
  }

  /**
   * 두 계정 사이 차단/친구 변경을 직렬화하는 트랜잭션 수준 잠금.
   * 차단과 친구 맺기가 동시에 들어와도 친구가 되살아나지 않는다.
   */
  async lockPair(tx: Prisma.TransactionClient, x: string, y: string) {
    const [a, b] = sorted(x, y);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`block:${a}:${b}`}, 0))`;
  }

  existsBetween(db: Db, a: string, b: string): Promise<boolean> {
    return db.block
      .findFirst({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
        select: { blockerId: true },
      })
      .then((row) => row !== null);
  }

  /** 멱등. 차단하면 친구 관계를 끊고, 서로 상대가 만든 클릭커의 받은 항목과 공유 코드를 지운다. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Cannot block yourself');
    }
    const target = await this.prisma.account.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    }
    const [accountA, accountB] = sorted(blockerId, blockedId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockPair(tx, blockerId, blockedId);
      await tx.block.createMany({
        data: [{ blockerId, blockedId }],
        skipDuplicates: true,
      });
      await tx.friendship.deleteMany({ where: { accountA, accountB } });
      // 서로의 클릭커를 상대가 계속 갖거나 퍼뜨리지 못하게 한다(양방향).
      await tx.inventoryItem.deleteMany({
        where: {
          source: 'received',
          OR: [
            { accountId: blockedId, clicker: { creatorId: blockerId } },
            { accountId: blockerId, clicker: { creatorId: blockedId } },
          ],
        },
      });
      await tx.shareCode.deleteMany({
        where: {
          OR: [
            { issuerId: blockedId, creatorId: blockerId },
            { issuerId: blockerId, creatorId: blockedId },
          ],
        },
      });
    });
  }

  /** 멱등. 끊긴 친구 관계는 되살리지 않는다. */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }
}
