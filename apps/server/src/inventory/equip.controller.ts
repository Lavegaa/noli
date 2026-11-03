import { Body, Controller, Param, Put } from '@nestjs/common';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { InventoryService } from './inventory.service.js';

class EquipDto {
  // undefined만 건너뛴다. null·빈 문자열은 400으로 거절한다.
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  sound?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
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
