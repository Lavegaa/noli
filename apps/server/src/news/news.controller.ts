import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { NewsService } from './news.service.js';

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list(@CurrentAccount() account: Account, @Query('unread') unread?: string) {
    return this.news.list(account.id, unread === 'true');
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(
    @CurrentAccount() account: Account,
    @Param('id') id: string,
  ): Promise<void> {
    await this.news.markRead(account.id, id);
  }
}
