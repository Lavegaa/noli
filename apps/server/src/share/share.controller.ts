import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { RequireCapability } from '../auth/capability.guard.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { ShareService } from './share.service.js';

class CreateShareDto {
  @IsBoolean()
  allowFriend!: boolean;
}

class RedeemDto {
  @IsBoolean()
  addFriend!: boolean;
}

@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Post('clickers/:id/share')
  @RequireCapability('share')
  create(
    @CurrentAccount() account: Account,
    @Param('id') id: string,
    @Body() dto: CreateShareDto,
  ) {
    return this.share.create(account, id, dto.allowFriend);
  }

  @Get('share/:code')
  preview(@CurrentAccount() account: Account, @Param('code') code: string) {
    return this.share.preview(account, code);
  }

  @Post('share/:code/redeem')
  @HttpCode(200)
  redeem(
    @CurrentAccount() account: Account,
    @Param('code') code: string,
    @Body() dto: RedeemDto,
  ) {
    return this.share.redeem(account, code, dto.addFriend);
  }
}
