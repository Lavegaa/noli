import { Injectable } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { AppError } from '../common/app-error.js';
import { sorted } from '../common/pair.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
  ) {}

  /**
   * 이미 친구여도 오류 없이 지나간다. 차단 관계면 403 BLOCKED.
   * 차단과 같은 쌍 잠금으로 직렬화해 차단 직후 친구가 되살아나지 않게 한다.
   */
  async link(
    x: string,
    y: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx) {
      await this.prisma.$transaction((inner) => this.link(x, y, inner));
      return;
    }
    const [accountA, accountB] = sorted(x, y);
    await this.blocks.lockPair(tx, x, y);
    if (await this.blocks.existsBetween(tx, x, y)) {
      throw new AppError(403, 'BLOCKED', 'Cannot befriend a blocked account');
    }
    await tx.friendship.upsert({
      where: { accountA_accountB: { accountA, accountB } },
      create: { accountA, accountB },
      update: {},
    });
  }

  async list(accountId: string): Promise<{ id: string; since: Date }[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ accountA: accountId }, { accountB: accountId }] },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.accountA === accountId ? r.accountB : r.accountA,
      since: r.createdAt,
    }));
  }

  /** Task 5(뉴스 피드)가 쓴다. */
  async friendIdsOf(accountId: string): Promise<string[]> {
    return (await this.list(accountId)).map((f) => f.id);
  }

  async remove(accountId: string, friendId: string): Promise<void> {
    const [accountA, accountB] = sorted(accountId, friendId);
    const { count } = await this.prisma.friendship.deleteMany({
      where: { accountA, accountB },
    });
    if (count === 0) {
      throw new AppError(404, 'FRIEND_NOT_FOUND', 'Not friends');
    }
  }
}
