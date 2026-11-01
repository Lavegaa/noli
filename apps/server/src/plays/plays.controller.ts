import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import { GAME } from '../config/game.config.js';
import type { Account, PlayMode } from '../generated/prisma/client.js';
import { PlaysService } from './plays.service.js';

const MAX_COUNTER = GAME.playValidation.maxCounter;

class RecordPlayDto {
  @IsUUID()
  clickerId!: string;

  @IsIn(['free', 'timed10'])
  mode!: PlayMode;

  @IsInt()
  @Min(0)
  @Max(MAX_COUNTER)
  score!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_COUNTER)
  maxCombo!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_COUNTER)
  taps!: number;

  /**
   * 1 미만과 10초 모드 초과는 형식 오류(400)가 아니라 검증 위반(422 PLAY_REJECTED)으로 다룬다.
   * 상한은 자유 모드 최대 길이(30분)로, 어떤 모드도 넘을 수 없다.
   */
  @IsInt()
  @Max(GAME.playValidation.freeMaxDurationMs)
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
