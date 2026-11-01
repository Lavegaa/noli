import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { PURCHASE_VERIFIER, type PurchaseVerifier } from '../common/ports.js';
import { GAME } from '../config/game.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isProductId, PRODUCTS } from './products.js';

const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';

export interface VerifyResult {
  storageSlots: number;
  alreadyApplied?: true;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PURCHASE_VERIFIER) private readonly verifier: PurchaseVerifier,
  ) {}

  async verify(
    accountId: string,
    platform: 'ios' | 'android',
    productId: string,
    receipt: string,
  ): Promise<VerifyResult> {
    if (!isProductId(productId)) {
      throw new AppError(
        400,
        'UNKNOWN_PRODUCT',
        `Unknown product: ${productId}`,
      );
    }
    const { valid, transactionId } = await this.verifier.verify(
      platform,
      productId,
      receipt,
    );
    if (!valid || !transactionId) {
      throw new AppError(
        402,
        'RECEIPT_INVALID',
        'Receipt could not be verified',
      );
    }

    const existing = await this.alreadyApplied(accountId, transactionId);
    if (existing) return existing;

    try {
      return await this.grant(accountId, platform, productId, transactionId);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // 같은 transactionId를 동시에 보낸 다른 요청이 먼저 반영했다.
      const winner = await this.alreadyApplied(accountId, transactionId);
      if (winner) return winner;
      throw e;
    }
  }

  /**
   * transactionId는 스토어 소유라 계정과 무관하게 한 번만 쓸 수 있다.
   * 다른 계정이 이미 쓴 영수증이면 지급하지 않고 409 TRANSACTION_ALREADY_USED.
   */
  private async alreadyApplied(
    accountId: string,
    transactionId: string,
  ): Promise<VerifyResult | null> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { transactionId },
    });
    if (!purchase) return null;
    if (purchase.accountId !== accountId) {
      throw new AppError(
        409,
        'TRANSACTION_ALREADY_USED',
        'This transaction was already applied to another account',
      );
    }
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
    });
    return { storageSlots: account.storageSlots, alreadyApplied: true };
  }

  private async grant(
    accountId: string,
    platform: 'ios' | 'android',
    productId: keyof typeof PRODUCTS,
    transactionId: string,
  ): Promise<VerifyResult> {
    const { slots } = PRODUCTS[productId];
    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.create({
        data: { transactionId, accountId, platform, productId },
      });
      // 조건부 증가: 최대치를 넘기면 0행이 갱신되고, 던져서 Purchase insert도 되돌린다.
      const { count } = await tx.account.updateMany({
        where: {
          id: accountId,
          storageSlots: { lte: GAME.storage.maxSlots - slots },
        },
        data: { storageSlots: { increment: slots } },
      });
      if (count === 0) {
        throw new AppError(
          409,
          'SLOTS_AT_MAX',
          'Storage is already at the maximum number of slots',
        );
      }
      const account = await tx.account.findUniqueOrThrow({
        where: { id: accountId },
      });
      return { storageSlots: account.storageSlots };
    });
  }
}
