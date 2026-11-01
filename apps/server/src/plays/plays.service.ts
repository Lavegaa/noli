import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClickersService } from '../clickers/clickers.service.js';
import { AppError } from '../common/app-error.js';
import { CLOCK, NOTIFIER, type Clock, type Notifier } from '../common/ports.js';
import { GAME } from '../config/game.config.js';
import { FriendsService } from '../friends/friends.service.js';
import type { Account, PlayMode } from '../generated/prisma/client.js';
import { NewsService } from '../news/news.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLAY_RECORDED, type PlayRecordedEvent } from './play-events.js';

export interface PlayInput {
  clickerId: string;
  mode: PlayMode;
  score: number;
  maxCombo: number;
  taps: number;
  durationMs: number;
}

const reject = (message: string) => new AppError(422, 'PLAY_REJECTED', message);

@Injectable()
export class PlaysService {
  private readonly logger = new Logger(PlaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickers: ClickersService,
    private readonly friends: FriendsService,
    private readonly news: NewsService,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async record(account: Account, input: PlayInput) {
    // 숨겨진 클릭커는 보관함 확인보다 먼저 404로 거른다.
    const clicker = await this.clickers.getVisible(input.clickerId);
    const holds = await this.prisma.inventoryItem.findUnique({
      where: {
        accountId_clickerId: {
          accountId: account.id,
          clickerId: clicker.id,
        },
      },
    });
    if (!holds) {
      throw new AppError(
        403,
        'NOT_IN_INVENTORY',
        'Clicker is not in inventory',
      );
    }
    this.validate(input);

    const playedAt = this.clock.now();
    const { previousBest, record } = await this.prisma.$transaction(
      async (tx) => {
        // 계정 행을 잠가 같은 계정의 동시 기록이 통계를 덮어쓰지 못하게 한다.
        await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;
        const record = await tx.playRecord.create({
          data: {
            accountId: account.id,
            clickerId: clicker.id,
            mode: input.mode,
            score: input.score,
            maxCombo: input.maxCombo,
            taps: input.taps,
            durationMs: input.durationMs,
            playedAt,
          },
        });
        const key = {
          accountId_clickerId: {
            accountId: account.id,
            clickerId: clicker.id,
          },
        };
        const stat = await tx.clickerStat.findUnique({ where: key });
        if (stat) {
          await tx.clickerStat.update({
            where: key,
            data: {
              bestScore: Math.max(stat.bestScore, input.score),
              bestCombo: Math.max(stat.bestCombo, input.maxCombo),
              totalTaps: stat.totalTaps + input.taps,
            },
          });
        } else {
          await tx.clickerStat.create({
            data: {
              accountId: account.id,
              clickerId: clicker.id,
              bestScore: input.score,
              bestCombo: input.maxCombo,
              totalTaps: input.taps,
            },
          });
        }
        return { previousBest: stat?.bestCombo ?? 0, record };
      },
    );

    const event: PlayRecordedEvent = {
      accountId: account.id,
      clickerId: clicker.id,
      creatorId: clicker.creatorId,
      mode: input.mode,
      maxCombo: input.maxCombo,
      taps: input.taps,
    };
    this.events.emit(PLAY_RECORDED, event);

    if (
      clicker.creatorId !== account.id &&
      input.maxCombo > previousBest &&
      (await this.friends.friendIdsOf(clicker.creatorId)).includes(account.id)
    ) {
      await this.announceFriendRecord(account.id, clicker, input.maxCombo);
    }
    return { id: record.id, playedAt };
  }

  private validate(input: PlayInput): void {
    const { maxTapsPerSecond, timed10MaxDurationMs } = GAME.playValidation;
    if (input.durationMs < 1) throw reject('durationMs must be at least 1');
    if (input.maxCombo > input.taps) throw reject('maxCombo exceeds taps');
    if ((input.taps * 1000) / input.durationMs > maxTapsPerSecond) {
      throw reject('Too many taps per second');
    }
    if (input.mode === 'timed10' && input.durationMs > timed10MaxDurationMs) {
      throw reject('Timed round ran too long');
    }
  }

  private async announceFriendRecord(
    friendId: string,
    clicker: { id: string; creatorId: string; name: string },
    maxCombo: number,
  ): Promise<void> {
    await this.news.add(clicker.creatorId, 'friend_record', {
      clickerId: clicker.id,
      friendId,
      maxCombo,
    });
    try {
      await this.notifier.notify(
        clicker.creatorId,
        '노리',
        `${GAME.news.friendLabel}가 네 클릭커로 ${maxCombo}콤보!`,
      );
    } catch (e) {
      // 푸시 실패가 이미 저장된 기록을 되돌리면 안 된다.
      this.logger.warn(`friend_record push failed: ${String(e)}`);
    }
  }
}
