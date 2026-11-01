import { Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { FriendsService } from './friends.service.js';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentAccount() account: Account) {
    return this.friends.list(account.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAccount() account: Account,
    @Param('id') id: string,
  ): Promise<void> {
    await this.friends.remove(account.id, id);
  }
}
