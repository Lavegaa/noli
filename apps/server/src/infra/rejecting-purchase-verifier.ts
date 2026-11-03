import { Injectable } from '@nestjs/common';
import type { PurchaseVerifier } from '../common/ports.js';

/** 계획 3에서 스토어 검증 구현으로 교체될 때까지 모든 영수증을 거부한다. */
@Injectable()
export class RejectingPurchaseVerifier implements PurchaseVerifier {
  async verify(): Promise<{ valid: boolean; transactionId: string }> {
    return { valid: false, transactionId: '' };
  }
}
