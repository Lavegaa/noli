import { Body, Controller, Param, Put } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { InventoryService } from './inventory.service.js';

class EquipDto {
  @IsOptional()
  @IsString()
  sound?: string;

  @IsOptional()
  @IsString()
  effect?: string;
}

@Controller('inventory')
export class EquipController {
  constructor(private readonly inventory: InventoryService) {}

  @Put(':itemId/equip')
  equip(
    @CurrentAccount() account: Account,
    @Param('itemId') itemId: string,
    @Body() dto: EquipDto,
  ) {
    return this.inventory.equip(account.id, itemId, dto);
  }
}
