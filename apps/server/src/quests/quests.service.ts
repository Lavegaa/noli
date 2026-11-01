import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { kstDay } from '../common/kst.js';
import { CLOCK, RANDOM, type Clock, type Random } from '../common/ports.js';
import { GAME } from '../config/game.config.js';
import type { DailyQuest } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QUEST_POOL, questDef } from './quest-pool.js';

export interface QuestView {
  key: string;
  title: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

const poolIndex = (key: string) => QUEST_POOL.findIndex((q) => q.key === key);

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  async today(accountId: string): Promise<QuestView[]> {
    const rows = await this.ensureToday(accountId);
    return rows
      .sort((a, b) => poolIndex(a.questKey) - poolIndex(b.questKey))
      .map(toView);
  }

  /** 오늘(KST)의 퀘스트를 한 번만 만든다. 계정 행 잠금으로 동시 첫 호출을 줄 세운다. */
  async ensureToday(accountId: string): Promise<DailyQuest[]> {
    const day = kstDay(this.clock.now());
    const existing = await this.prisma.dailyQuest.findMany({
      where: { accountId, day },
    });
    if (existing.length > 0) return existing;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE`;
      const again = await tx.dailyQuest.findMany({ where: { accountId, day } });
      if (again.length > 0) return again;
      const chosen = this.draw(GAME.quests.dailyCount);
      await tx.dailyQuest.createMany({
        data: chosen.map((q) => ({
          accountId,
          day,
          questKey: q.key,
          target: q.target,
          reward: q.reward,
        })),
      });
      return tx.dailyQuest.findMany({ where: { accountId, day } });
    });
  }

  /** 완료했고 아직 안 받았을 때만 한 번 지급한다. 조건부 UPDATE가 동시 요청을 막는다. */
  async claim(accountId: string, key: string): Promise<{ shards: number }> {
    const day = kstDay(this.clock.now());
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<{ reward: number }[]>`
        UPDATE "DailyQuest" SET "claimedAt" = ${now}
        WHERE "accountId" = ${accountId} AND "day" = ${day} AND "questKey" = ${key}
          AND "claimedAt" IS NULL AND "progress" >= "target"
        RETURNING "reward"`;
      if (claimed.length === 0) {
        const row = await tx.dailyQuest.findUnique({
          where: { accountId_day_questKey: { accountId, day, questKey: key } },
        });
        if (!row)
          throw new AppError(404, 'QUEST_NOT_FOUND', 'No such quest today');
        if (row.claimedAt) {
          throw new AppError(409, 'ALREADY_CLAIMED', 'Reward already claimed');
        }
        throw new AppError(
          409,
          'QUEST_INCOMPLETE',
          'Quest is not complete yet',
        );
      }
      const account = await tx.account.update({
        where: { id: accountId },
        data: { shards: { increment: claimed[0].reward } },
      });
      return { shards: account.shards };
    });
  }

  /** 풀에서 겹치지 않게 `count`개를 뽑는다. */
  private draw(count: number) {
    const remaining = [...QUEST_POOL];
    const chosen = [];
    for (let i = 0; i < count && remaining.length > 0; i++) {
      const idx = Math.min(
        Math.floor(this.random.next() * remaining.length),
        remaining.length - 1,
      );
      chosen.push(...remaining.splice(idx, 1));
    }
    return chosen;
  }
}

const toView = (row: DailyQuest): QuestView => ({
  key: row.questKey,
  title: questDef(row.questKey)?.title ?? row.questKey,
  target: row.target,
  progress: row.progress,
  reward: row.reward,
  claimed: row.claimedAt !== null,
});
