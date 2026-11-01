import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { GAME } from '../config/game.config.js';
import type {
  Account,
  Prisma,
  ReportReason,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** 클릭커를 숨겨 두는(=검토가 끝나지 않았거나 삭제 판정된) 신고 상태. */
const OPEN = ['pending', 'removed'] as const;

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 접수 즉시 클릭커를 숨긴다. 같은 사람이 같은 클릭커를 다시 신고하면 아무것도 바꾸지 않는다(멱등).
   * (reporterId, clickerId) 유니크가 동시 중복 요청을 막고, 충돌은 멱등 성공으로 처리한다.
   */
  async report(
    reporter: Account,
    clickerId: string,
    reason: ReportReason,
    note?: string,
  ): Promise<void> {
    const clicker = await this.prisma.clicker.findUnique({
      where: { id: clickerId },
      select: { id: true, creatorId: true },
    });
    if (!clicker) {
      throw new AppError(404, 'CLICKER_NOT_FOUND', 'Clicker not found');
    }
    if (clicker.creatorId === reporter.id) {
      throw new AppError(409, 'OWN_CLICKER', 'This is your own clicker');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // 제작자 행을 먼저 잠가 같은 제작자에 대한 신고/해제를 줄 세운다.
        // 그래야 서로 다른 클릭커 3건이 동시에 들어와도 제한 계산이 누락되지 않는다.
        await this.lockCreator(tx, clicker.creatorId);
        await tx.report.create({
          data: {
            reporterId: reporter.id,
            clickerId,
            reason,
            note: note ?? null,
          },
        });
        await tx.clicker.update({
          where: { id: clickerId },
          data: { hidden: true },
        });
        await this.refreshUploadRestriction(tx, clicker.creatorId);
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // 이미 같은 신고가 있다. 멱등 성공.
    }
  }

  /**
   * 관리자 웹이 쓴다. restored면 이 클릭커에 열린 신고(pending/removed)가 더 없고 이미지 검사로 숨겨진 것도 아닐 때만 숨김을 푼다.
   * 처리 후 제작자의 업로드 제한을 다시 계산한다(복원으로 3 미만이 되면 해제).
   */
  async resolve(
    reportId: string,
    status: 'restored' | 'removed',
  ): Promise<void> {
    const found = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        clicker: { select: { creatorId: true, hiddenByScan: true } },
      },
    });
    if (!found) {
      throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
    }
    const { clickerId } = found;
    const creatorId = found.clicker.creatorId;
    await this.prisma.$transaction(async (tx) => {
      await this.lockCreator(tx, creatorId);
      await tx.report.update({ where: { id: reportId }, data: { status } });
      // 검사에서 걸려 숨겨진 클릭커는 신고가 복원돼도 계속 숨긴다.
      const stillOpen =
        status === 'removed' ||
        found.clicker.hiddenByScan ||
        (await tx.report.count({
          where: { clickerId, status: { in: [...OPEN] } },
        })) > 0;
      await tx.clicker.update({
        where: { id: clickerId },
        data: { hidden: stillOpen },
      });
      await this.refreshUploadRestriction(tx, creatorId);
    });
  }

  private async lockCreator(tx: Prisma.TransactionClient, creatorId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${creatorId} FOR UPDATE`;
  }

  /** 반복 침해자: 제작자의 서로 다른 클릭커 중 pending/removed 신고가 있는 수가 기준 이상이면 제한. */
  private async refreshUploadRestriction(
    tx: Prisma.TransactionClient,
    creatorId: string,
  ): Promise<void> {
    const reported = await tx.report.findMany({
      where: { status: { in: [...OPEN] }, clicker: { creatorId } },
      distinct: ['clickerId'],
      select: { clickerId: true },
    });
    await tx.account.update({
      where: { id: creatorId },
      data: {
        uploadRestricted: reported.length >= GAME.report.restrictUploadAt,
      },
    });
  }
}
