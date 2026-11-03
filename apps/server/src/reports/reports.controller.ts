import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account, ReportReason } from '../generated/prisma/client.js';
import { ReportsService } from './reports.service.js';

class CreateReportDto {
  @IsUUID()
  clickerId!: string;

  @IsIn(['face', 'copyright', 'inappropriate', 'other'])
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 게스트도 신고할 수 있다(RequireCapability 없음). */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(200)
  async create(
    @CurrentAccount() account: Account,
    @Body() dto: CreateReportDto,
  ) {
    await this.reports.report(account, dto.clickerId, dto.reason, dto.note);
    return { reported: true };
  }
}
