import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { BlocksService } from './blocks.service.js';

class BlockDto {
  @IsString()
  @MinLength(1)
  accountId!: string;
}

@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post()
  @HttpCode(200)
  async block(@CurrentAccount() account: Account, @Body() dto: BlockDto) {
    await this.blocks.block(account.id, dto.accountId);
    return { accountId: dto.accountId };
  }

  @Delete(':accountId')
  @HttpCode(204)
  async unblock(
    @CurrentAccount() account: Account,
    @Param('accountId') accountId: string,
  ): Promise<void> {
    await this.blocks.unblock(account.id, accountId);
  }
}
