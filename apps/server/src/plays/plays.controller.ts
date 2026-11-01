import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsInt, IsUUID, Min } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import type { Account, PlayMode } from '../generated/prisma/client.js';
import { PlaysService } from './plays.service.js';

class RecordPlayDto {
  @IsUUID()
  clickerId!: string;

  @IsIn(['free', 'timed10'])
  mode!: PlayMode;

  @IsInt()
  @Min(0)
  score!: number;

  @IsInt()
  @Min(0)
  maxCombo!: number;

  @IsInt()
  @Min(0)
  taps!: number;

  /** 1 미만은 형식 오류(400)가 아니라 검증 위반(422 PLAY_REJECTED)으로 다룬다. */
  @IsInt()
  durationMs!: number;
}

@Controller('plays')
export class PlaysController {
  constructor(private readonly plays: PlaysService) {}

  @Post()
  record(@CurrentAccount() account: Account, @Body() dto: RecordPlayDto) {
    return this.plays.record(account, dto);
  }
}
