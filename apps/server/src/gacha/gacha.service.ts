import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { RANDOM, type Random } from '../common/ports.js';
import { GAME } from '../config/game.config.js';
import type { GachaPull, Switch } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { pickGrade, pickSwitch } from './gacha.math.js';
import { SWITCH_CATALOG, type Grade } from './switch-catalog.js';

const GRADES: readonly Grade[] = ['common', 'rare', 'epic', 'legend'];

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';

export const toSwitchView = (s: Switch) => ({
  id: s.id,
  kind: s.kind,
  grade: s.grade,
  name: s.name,
  assetJson: s.assetJson,
});

export interface PullResult {
  switch: ReturnType<typeof toSwitchView>;
  grade: Grade;
  duplicate: boolean;
  refund: number;
  shards: number;
  pityCounter: number;
}

@Injectable()
export class GachaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  /** 확률 공개용. 인증 없이 호출된다. */
  rates() {
    const { rates, pityPull, shardsPerPull, duplicateRefund } = GAME.gacha;
    return {
      rates,
      shardsPerPull,
      duplicateRefund,
      switches: Object.fromEntries(
        GRADES.map((grade) => [
          grade,
          SWITCH_CATALOG.filter((s) => s.grade === grade).map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
          })),
        ]),
      ),
      equalWithinGrade:
        '같은 등급 안에서는 모든 스위치가 같은 확률로 나옵니다.',
      pity: {
        pullCount: pityPull,
        resetsOnEpicOrLegend: true,
        resetDescription:
          '천장 카운터는 epic 또는 legend가 나오면 0으로 초기화되고, 그 외 등급이 나오면 1 늘어납니다.',
        description: `직전에 epic 이상이 나온 뒤 ${pityPull}번째 뽑기는 epic 이상이 확정됩니다. epic과 legend는 ${rates.epic}:${rates.legend} 비율로 나옵니다.`,
      },
    };
  }

  async owned(accountId: string) {
    const rows = await this.prisma.ownedSwitch.findMany({
      where: { accountId },
      include: { switch: true },
      orderBy: { acquiredAt: 'asc' },
    });
    return {
      switches: rows.map((row) => ({
        ...toSwitchView(row.switch),
        acquiredAt: row.acquiredAt,
      })),
    };
  }

  /**
   * 계정 행을 잠가 같은 계정의 뽑기를 줄 세운다. 잠금 안에서 requestId를 다시 확인하므로
   * 같은 요청이 동시에 와도 한 번만 처리되고, 나머지는 저장된 결과를 돌려받는다.
   */
  async pull(accountId: string, requestId: string): Promise<PullResult> {
    const prior = await this.replay(accountId, requestId);
    if (prior) return prior;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR NO KEY UPDATE`;
        const again = await tx.gachaPull.findUnique({
          where: { requestId },
          include: { switch: true },
        });
        if (again) return this.toResult(accountId, again);

        const cost = GAME.gacha.shardsPerPull;
        const spent = await tx.$queryRaw<
          { shards: number; pityCounter: number }[]
        >`UPDATE "Account" SET "shards" = "shards" - ${cost}
          WHERE "id" = ${accountId} AND "shards" >= ${cost}
          RETURNING "shards", "pityCounter"`;
        if (spent.length === 0) {
          throw new AppError(
            409,
            'NOT_ENOUGH_SHARDS',
            'Not enough shards to pull',
          );
        }

        const grade = pickGrade(this.random.next(), spent[0].pityCounter);
        const picked = pickSwitch(grade, this.random.next());
        const alreadyOwned = await tx.ownedSwitch.findUnique({
          where: {
            accountId_switchId: { accountId, switchId: picked.id },
          },
        });
        const duplicate = alreadyOwned !== null;
        const refund = duplicate ? GAME.gacha.duplicateRefund[grade] : 0;
        if (!duplicate) {
          await tx.ownedSwitch.create({
            data: { accountId, switchId: picked.id },
          });
        }
        const pityCounter =
          grade === 'epic' || grade === 'legend' ? 0 : spent[0].pityCounter + 1;
        const account = await tx.account.update({
          where: { id: accountId },
          data: { shards: { increment: refund }, pityCounter },
        });
        const row = await tx.gachaPull.create({
          data: {
            accountId,
            switchId: picked.id,
            duplicate,
            refund,
            shardsAfter: account.shards,
            pityAfter: pityCounter,
            requestId,
          },
          include: { switch: true },
        });
        return this.toResult(accountId, row);
      });
    } catch (e) {
      // 다른 계정이 같은 requestId를 먼저 썼다.
      if (isUniqueViolation(e)) {
        throw new AppError(
          409,
          'REQUEST_ID_CONFLICT',
          'requestId was already used',
        );
      }
      throw e;
    }
  }

  private async replay(accountId: string, requestId: string) {
    const row = await this.prisma.gachaPull.findUnique({
      where: { requestId },
      include: { switch: true },
    });
    return row ? this.toResult(accountId, row) : null;
  }

  private toResult(
    accountId: string,
    row: GachaPull & { switch: Switch },
  ): PullResult {
    if (row.accountId !== accountId) {
      throw new AppError(
        409,
        'REQUEST_ID_CONFLICT',
        'requestId was already used',
      );
    }
    return {
      switch: toSwitchView(row.switch),
      grade: row.switch.grade,
      duplicate: row.duplicate,
      refund: row.refund,
      shards: row.shardsAfter,
      pityCounter: row.pityAfter,
    };
  }
}
