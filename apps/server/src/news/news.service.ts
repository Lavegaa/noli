import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export type NewsType = 'friend_record' | 'received';

@Injectable()
export class NewsService {
  /** 임시 구현: Task 5에서 NewsItem 모델에 저장하도록 채운다. */
  add(
    _recipientId: string,
    _type: NewsType,
    _payload: Prisma.InputJsonObject,
    _tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return Promise.resolve();
  }
}
