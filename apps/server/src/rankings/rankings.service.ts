import { Inject, Injectable } from '@nestjs/common';
import { kstWeekStart } from '../common/kst.js';
import { CLOCK, type Clock } from '../common/ports.js';
import { FriendsService } from '../friends/friends.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type RankingMetric = 'maxCombo' | 'totalTaps' | 'creatorPopularity';
export type RankingPeriod = 'week' | 'all';

export interface RankingRow {
  accountId: string;
  value: number;
  rank: number;
  me: boolean;
}

@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async friendRanking(
    accountId: string,
    metric: RankingMetric,
    period: RankingPeriod,
  ): Promise<RankingRow[]> {
    const ids = [accountId, ...(await this.friends.friendIdsOf(accountId))];
    const since =
      period === 'week' ? kstWeekStart(this.clock.now()) : new Date(0);
    const values = await this.valuesOf(metric, ids, since);

    const sorted = ids
      .map((id) => ({ accountId: id, value: values.get(id) ?? 0 }))
      .sort(
        (a, b) => b.value - a.value || a.accountId.localeCompare(b.accountId),
      );
    // 동점은 같은 순위(1, 1, 3 ...)
    const rows: RankingRow[] = [];
    sorted.forEach((row, i) => {
      const tied = i > 0 && sorted[i - 1].value === row.value;
      rows.push({
        ...row,
        rank: tied ? rows[i - 1].rank : i + 1,
        me: row.accountId === accountId,
      });
    });
    return rows;
  }

  private async valuesOf(
    metric: RankingMetric,
    ids: string[],
    since: Date,
  ): Promise<Map<string, number>> {
    if (metric === 'creatorPopularity') return this.popularity(ids, since);
    // 숨겨졌거나 제작자가 지운 클릭커의 플레이는 세지 않는다.
    const where = {
      accountId: { in: ids },
      playedAt: { gte: since },
      clicker: { hidden: false, deletedByCreator: false },
    };
    const groups = await this.prisma.playRecord.groupBy({
      by: ['accountId'],
      where,
      _max: { maxCombo: true },
      _sum: { taps: true },
    });
    return new Map(
      groups.map((g) => [
        g.accountId,
        (metric === 'maxCombo' ? g._max.maxCombo : g._sum.taps) ?? 0,
      ]),
    );
  }

  /**
   * 받은 횟수(source='received'인 보관함 항목 생성 시각 기준)와 다른 사람의 플레이 수.
   * 둘 다 `since` 이후만 세고, 숨겨졌거나 지워진 클릭커는 제외한다.
   */
  private async popularity(
    ids: string[],
    since: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ id: string; n: number }[]>`
      SELECT c."creatorId" AS id, COUNT(*)::int AS n
      FROM "InventoryItem" i JOIN "Clicker" c ON c."id" = i."clickerId"
      WHERE c."creatorId" = ANY(${ids}::text[])
        AND c."hidden" = false AND c."deletedByCreator" = false
        AND i."source" = 'received' AND i."createdAt" >= ${since}
      GROUP BY c."creatorId"
      UNION ALL
      SELECT c."creatorId" AS id, COUNT(*)::int AS n
      FROM "PlayRecord" p JOIN "Clicker" c ON c."id" = p."clickerId"
      WHERE c."creatorId" = ANY(${ids}::text[])
        AND c."hidden" = false AND c."deletedByCreator" = false
        AND p."accountId" <> c."creatorId" AND p."playedAt" >= ${since}
      GROUP BY c."creatorId"`;
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.id, (totals.get(r.id) ?? 0) + r.n);
    return totals;
  }
}
