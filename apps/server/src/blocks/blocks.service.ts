import { Injectable } from '@nestjs/common';

@Injectable()
export class BlocksService {
  /** 임시 구현: Task 8에서 Block 모델을 읽도록 채운다. 어느 방향이든 차단이면 true. */
  isBlocked(_a: string, _b: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}
