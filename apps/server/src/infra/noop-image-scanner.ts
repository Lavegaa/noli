import { Injectable } from '@nestjs/common';
import type { ImageScanner } from '../common/ports.js';

/** v1 기본값: 항상 통과. 실제 Vision 연동은 계획 4에서 교체한다. */
@Injectable()
export class NoopImageScanner implements ImageScanner {
  async scan(): Promise<{ adult: boolean; violence: boolean }> {
    return { adult: false, violence: false };
  }
}
