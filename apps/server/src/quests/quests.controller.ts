import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { QuestsService } from './quests.service.js';

@Controller('quests')
export class QuestsController {
  constructor(private readonly quests: QuestsService) {}

  @Get('today')
  today(@CurrentAccount() account: Account) {
    return this.quests.today(account.id);
  }

  @Post(':key/claim')
  claim(@CurrentAccount() account: Account, @Param('key') key: string) {
    return this.quests.claim(account.id, key);
  }
}
