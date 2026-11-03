import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/ports.js';
import type { NewsType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type { NewsType };

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 트랜잭션 안에서 부르면 호출한 쪽 트랜잭션에 함께 묶인다. */
  async add(
    recipientId: string,
    type: NewsType,
    payload: Prisma.InputJsonObject,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).newsItem.create({
      data: { recipientId, type, payload },
    });
  }

  list(recipientId: string, unreadOnly: boolean) {
    return this.prisma.newsItem.findMany({
      where: { recipientId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 이미 읽은 항목은 읽은 시각을 바꾸지 않는다(멱등). 남의 항목은 404. */
  async markRead(recipientId: string, id: string): Promise<void> {
    const item = await this.prisma.newsItem.findFirst({
      where: { id, recipientId },
    });
    if (!item) throw new AppError(404, 'NEWS_NOT_FOUND', 'News not found');
    await this.prisma.newsItem.updateMany({
      where: { id, recipientId, readAt: null },
      data: { readAt: this.clock.now() },
    });
  }
}
