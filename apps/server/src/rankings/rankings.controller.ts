import { Controller, Get, Query } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account } from '../generated/prisma/client.js';
import {
  RankingsService,
  type RankingMetric,
  type RankingPeriod,
} from './rankings.service.js';

class RankingQuery {
  @IsIn(['maxCombo', 'totalTaps', 'creatorPopularity'])
  metric!: RankingMetric;

  @IsIn(['week', 'all'])
  period!: RankingPeriod;
}

@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  @Get('friends')
  friends(@CurrentAccount() account: Account, @Query() q: RankingQuery) {
    return this.rankings.friendRanking(account.id, q.metric, q.period);
  }
}
