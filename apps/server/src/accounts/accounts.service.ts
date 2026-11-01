import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { capabilitiesOf, isUnder14 } from '../auth/capability.js';
import { CLOCK, type Clock } from '../common/ports.js';
import type { Account } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async profile(account: Account) {
    return {
      id: account.id,
      linked: account.linkedProviders.length > 0,
      storageSlots: account.storageSlots,
      usedSlots: await this.usedSlots(account.id),
      shards: account.shards,
      capabilities: capabilitiesOf(account, this.clock.now()),
    };
  }

  /** 보관함에서 쓰는 칸 수. InventoryItem 모델이 생기는 Task 3에서 count로 채운다. */
  private async usedSlots(_accountId: string): Promise<number> {
    return 0;
  }

  async setBirthDate(account: Account, birthDate: string): Promise<Account> {
    const date = parseBirthDate(birthDate, this.clock.now());
    const consentStatus = isUnder14(date, this.clock.now())
      ? // 이미 보호자 동의를 받았다면 생일 재입력으로 되돌리지 않는다.
        account.consentStatus === 'granted'
        ? 'granted'
        : 'pending'
      : 'not_required';
    return this.prisma.account.update({
      where: { id: account.id },
      data: { birthDate: date, consentStatus },
    });
  }
}

/** 실제 존재하는 과거(또는 오늘) 날짜만 허용한다. */
function parseBirthDate(value: string, now: Date): Date {
  const date = new Date(`${value}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
  const kstToday = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (!valid || date.getTime() > kstToday.getTime()) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'birthDate must be a past YYYY-MM-DD date',
    );
  }
  return date;
}
