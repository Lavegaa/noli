import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { capabilitiesOf, isUnder14 } from '../auth/capability.js';
import { CLOCK, type Clock } from '../common/ports.js';
import type { Account } from '../generated/prisma/client.js';
import { DEFAULT_SWITCH_IDS } from '../gacha/switch-catalog.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * firebaseUid로 계정을 찾거나 만든다. 새 계정은 기본 스위치와 한 트랜잭션으로 만들어
   * 한 번만 지급된다. 동시에 첫 요청이 와서 unique 충돌이 나면 이미 만들어진 계정을 쓴다.
   */
  async ensure(
    firebaseUid: string,
    linkedProviders: string[],
  ): Promise<Account> {
    const update = () =>
      this.prisma.account.update({
        where: { firebaseUid },
        data: { linkedProviders },
      });
    if (await this.prisma.account.findUnique({ where: { firebaseUid } })) {
      return update();
    }
    try {
      return await this.prisma.account.create({
        data: {
          firebaseUid,
          linkedProviders,
          ownedSwitches: {
            create: DEFAULT_SWITCH_IDS.map((switchId) => ({ switchId })),
          },
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return update();
      throw e;
    }
  }

  async profile(account: Account) {
    return {
      id: account.id,
      linked: account.linkedProviders.length > 0,
      storageSlots: account.storageSlots,
      usedSlots: await this.inventory.countVisible(account.id),
      shards: account.shards,
      capabilities: capabilitiesOf(account, this.clock.now()),
    };
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
