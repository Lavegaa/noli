import { Inject, Injectable } from '@nestjs/common';
import { toClickerView } from '../clickers/clicker-view.js';
import { retireClicker } from '../clickers/retire-clicker.js';
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
          SELECT "storageSlots" FROM "Account" WHERE "id" = ${accountId} FOR NO KEY UPDATE`
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
        return {
          id: item.id,
          source: item.source,
          clicker: toClickerView(item.clicker, this.storage),
          equip: equipOf(item, item.clicker.specJson),
        };
      }),
    };
  }

  /**
   * 내가 가진 스위치만, 맞는 칸(sound/effect)에만 장착한다. 하나라도 어긋나면 아무것도 바꾸지 않는다.
   */
  async equip(
    accountId: string,
    itemId: string,
    dto: { sound?: string; effect?: string },
  ) {
    // 바꿀 칸이 하나도 없는 요청({})은 400으로 거절한다.
    if (dto.sound === undefined && dto.effect === undefined) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Provide sound and/or effect to equip',
      );
    }
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, accountId, ...VISIBLE },
      include: { clicker: true },
    });
    if (!item) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
    }
    const slots = [
      ['sound', dto.sound],
      ['effect', dto.effect],
    ] as const;
    for (const [kind, switchId] of slots) {
      if (switchId === undefined) continue;
      const owned = await this.prisma.ownedSwitch.findUnique({
        where: { accountId_switchId: { accountId, switchId } },
        include: { switch: true },
      });
      if (!owned) {
        throw new AppError(
          403,
          'SWITCH_NOT_OWNED',
          'You do not own this switch',
        );
      }
      if (owned.switch.kind !== kind) {
        throw new AppError(
          400,
          'SWITCH_KIND_MISMATCH',
          `Switch ${switchId} is not a ${kind} switch`,
        );
      }
    }
    const updated = await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        ...(dto.sound !== undefined && { soundSwitchId: dto.sound }),
        ...(dto.effect !== undefined && { effectSwitchId: dto.effect }),
      },
    });
    return { id: updated.id, equip: equipOf(updated, item.clicker.specJson) };
  }

  /**
   * 내가 만든(created) 항목을 지우면 클릭커 삭제와 같다: 공유 코드가 무효가 되고
   * 더는 수정·공유할 수 없다(Ruling N). 받은 항목은 내 보관함에서만 빠진다.
   */
  async remove(accountId: string, itemId: string): Promise<void> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, accountId },
      include: { clicker: { select: { creatorId: true } } },
    });
    if (!item) {
      throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
    }
    if (item.source === 'created' && item.clicker.creatorId === accountId) {
      await this.prisma.$transaction((tx) =>
        retireClicker(tx, accountId, item.clickerId),
      );
      return;
    }
    await this.prisma.inventoryItem.deleteMany({
      where: { id: itemId, accountId },
    });
  }
}

/** 장착한 칸은 내 스위치, 비운 칸은 클릭커 제작자의 기본 장착. */
function equipOf(
  item: { soundSwitchId: string | null; effectSwitchId: string | null },
  spec: unknown,
) {
  const fallback = defaultEquipOf(spec);
  return {
    sound: item.soundSwitchId ?? fallback.sound,
    effect: item.effectSwitchId ?? fallback.effect,
  };
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
