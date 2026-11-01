import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import { AccountsService } from './accounts.service.js';

class SetBirthDateDto {
  @IsString()
  birthDate!: string;
}

@Controller('me')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  me(@CurrentAccount() account: Account) {
    return this.accounts.profile(account);
  }

  @Put('birthdate')
  async setBirthDate(
    @CurrentAccount() account: Account,
    @Body() dto: SetBirthDateDto,
  ) {
    const updated = await this.accounts.setBirthDate(account, dto.birthDate);
    return this.accounts.profile(updated);
  }
}
