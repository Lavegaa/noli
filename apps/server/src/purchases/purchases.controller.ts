import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { RequireCapability } from '../auth/capability.guard.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { PurchasesService } from './purchases.service.js';

class VerifyPurchaseDto {
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsString()
  @MinLength(1)
  productId!: string;

  @IsString()
  @MinLength(1)
  receipt!: string;
}

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post('verify')
  @HttpCode(200)
  @RequireCapability('purchase')
  verify(@CurrentAccount() account: Account, @Body() dto: VerifyPurchaseDto) {
    return this.purchases.verify(
      account.id,
      dto.platform,
      dto.productId,
      dto.receipt,
    );
  }
}
