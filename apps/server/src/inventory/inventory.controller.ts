import { Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@CurrentAccount() account: Account) {
    return this.inventory.list(account);
  }

  @Delete(':itemId')
  @HttpCode(204)
  async remove(
    @CurrentAccount() account: Account,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    await this.inventory.remove(account.id, itemId);
  }
}
