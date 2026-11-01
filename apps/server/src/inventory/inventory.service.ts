import { Inject, Injectable } from '@nestjs/common';
import { toClickerView } from '../clickers/clicker-view.js';
import { AppError } from '../common/app-error.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../common/ports.js';
import type {
  Account,
  InventorySource,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

/** 신고로 숨겨진 클릭커는 칸도 차지하지 않고 목록에도 나오지 않는다. */
const VISIBLE = { clicker: { hidden: false } } as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  countVisible(accountId: string, tx?: Db): Promise<number> {
    return (tx ?? this.prisma).inventoryItem.count({
      where: { accountId, ...VISIBLE },
    });
  }

  /**
   * 칸이 가득 차면 409 SLOT_FULL. 트랜잭션 안에서 부르면 계정 행을 잠가
   * 동시에 들어온 요청이 같은 빈 칸을 두 번 쓰지 못하게 한다.
   */
  async assertFreeSlot(accountId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const rows = tx
      ? await tx.$queryRaw<{ storageSlots: number }[]>`
          SELECT "storageSlots" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE`
      : await this.prisma.$queryRaw<{ storageSlots: number }[]>`
          SELECT "storageSlots" FROM "Account" WHERE "id" = ${accountId}`;
    const slots = rows[0]?.storageSlots ?? 0;
    if ((await this.countVisible(accountId, db)) >= slots) {
      throw new AppError(409, 'SLOT_FULL', 'Inventory is full');
    }
  }

  add(
    accountId: string,
    clickerId: string,
    source: InventorySource,
    receivedVersion?: number,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).inventoryItem.create({
      data: {
        accountId,
        clickerId,
        source,
        receivedVersion: receivedVersion ?? null,
      },
    });
  }

  async list(account: Account) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { accountId: account.id, ...VISIBLE },
      include: { clicker: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      storageSlots: account.storageSlots,
      items: items.map((item) => {
        const fallback = defaultEquipOf(item.clicker.specJson);
        return {
          id: item.id,
          source: item.source,
          clicker: toClickerView(item.clicker, this.storage),
          equip: {
            sound: item.soundSwitchId ?? fallback.sound,
            effect: item.effectSwitchId ?? fallback.effect,
          },
        };
      }),
    };
  }

  async remove(accountId: string, itemId: string): Promise<void> {
    const { count } = await this.prisma.inventoryItem.deleteMany({
      where: { id: itemId, accountId },
    });
    if (count === 0) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
    }
  }
}

function defaultEquipOf(spec: unknown): {
  sound: string | null;
  effect: string | null;
} {
  const equip = (spec as { defaultEquip?: Record<string, unknown> } | null)
    ?.defaultEquip;
  const pick = (v: unknown) => (typeof v === 'string' ? v : null);
  return { sound: pick(equip?.sound), effect: pick(equip?.effect) };
}
