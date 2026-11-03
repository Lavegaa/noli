import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { GachaService } from './gacha.service.js';

class PullDto {
  @IsUUID()
  requestId!: string;
}

@Controller()
export class GachaController {
  constructor(private readonly gacha: GachaService) {}

  @Public()
  @Get('gacha/rates')
  rates() {
    return this.gacha.rates();
  }

  @Post('gacha/pull')
  pull(@CurrentAccount() account: Account, @Body() dto: PullDto) {
    return this.gacha.pull(account.id, dto.requestId);
  }

  @Get('switches/owned')
  owned(@CurrentAccount() account: Account) {
    return this.gacha.owned(account.id);
  }
}
