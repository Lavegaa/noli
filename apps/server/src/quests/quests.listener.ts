import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { kstDay } from '../common/kst.js';
import { CLOCK, type Clock } from '../common/ports.js';
import { PLAY_RECORDED, type PlayRecordedEvent } from '../plays/play-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SHARE_REDEEMED,
  type ShareRedeemedEvent,
} from '../share/share-events.js';
import { playIncrement, questDef } from './quest-pool.js';
import { QuestsService } from './quests.service.js';

/**
 * 이벤트마다 오늘 퀘스트 진행도를 올린다(target 상한). 실패는 기록만 하고 삼킨다.
 * 발행하는 요청이 퀘스트 때문에 실패하면 안 되기 때문이다.
 */
@Injectable()
export class QuestsListener {
  private readonly logger = new Logger(QuestsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quests: QuestsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @OnEvent(PLAY_RECORDED)
  async onPlay(e: PlayRecordedEvent): Promise<void> {
    await this.safely('play', async () => {
      const rows = await this.quests.ensureToday(e.accountId);
      const day = kstDay(this.clock.now());
      for (const row of rows) {
        const def = questDef(row.questKey);
        if (!def) continue;
        const where = { accountId: e.accountId, day, key: row.questKey };
        if (def.event === 'play') {
          const by = playIncrement(def, e);
          if (by > 0) await this.add(where, by);
        } else if (def.event === 'combo') {
          await this.raiseTo(where, e.maxCombo);
        } else if (def.event === 'friend_play' && e.creatorId !== e.accountId) {
          await this.countClicker(where, e.clickerId);
        }
      }
    });
  }

  @OnEvent(SHARE_REDEEMED)
  async onRedeem(e: ShareRedeemedEvent): Promise<void> {
    await this.safely('redeem', async () => {
      const rows = await this.quests.ensureToday(e.receiverId);
      const day = kstDay(this.clock.now());
      for (const row of rows) {
        if (questDef(row.questKey)?.event === 'redeem') {
          await this.add(
            { accountId: e.receiverId, day, key: row.questKey },
            1,
          );
        }
      }
    });
  }

  private async safely(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (e) {
      this.logger.error(`quest progress (${name}) failed: ${String(e)}`);
    }
  }

  private add(w: Where, by: number) {
    return this.prisma.$executeRaw`
      UPDATE "DailyQuest" SET "progress" = LEAST("target", "progress" + ${by})
      WHERE "accountId" = ${w.accountId} AND "day" = ${w.day} AND "questKey" = ${w.key}`;
  }

  private raiseTo(w: Where, value: number) {
    return this.prisma.$executeRaw`
      UPDATE "DailyQuest" SET "progress" = LEAST("target", GREATEST("progress", ${value}))
      WHERE "accountId" = ${w.accountId} AND "day" = ${w.day} AND "questKey" = ${w.key}`;
  }

  /** 아직 세지 않은 클릭커일 때만 1 올리고 기록한다. */
  private countClicker(w: Where, clickerId: string) {
    return this.prisma.$executeRaw`
      UPDATE "DailyQuest"
      SET "progress" = LEAST("target", "progress" + 1),
          "countedClickerIds" = array_append("countedClickerIds", ${clickerId})
      WHERE "accountId" = ${w.accountId} AND "day" = ${w.day} AND "questKey" = ${w.key}
        AND NOT (${clickerId} = ANY("countedClickerIds"))`;
  }
}

interface Where {
  accountId: string;
  day: string;
  key: string;
}
