import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../common/ports.js';
import type { Account, Clicker, Prisma } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toClickerView } from './clicker-view.js';
import type { ParsedUpload } from './clicker-upload.js';

const keyOf = (id: string, version: number, file: 'idle' | 'pressed') =>
  `clickers/${id}/v${version}/${file}.png`;

@Injectable()
export class ClickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** 숨겨진 클릭커는 404 CLICKER_UNAVAILABLE. Task 4, 5, 8이 쓴다. */
  async getVisible(id: string): Promise<Clicker> {
    const clicker = await this.prisma.clicker.findUnique({ where: { id } });
    if (!clicker) {
      throw new AppError(404, 'CLICKER_NOT_FOUND', 'Clicker not found');
    }
    if (clicker.hidden) {
      throw new AppError(404, 'CLICKER_UNAVAILABLE', 'Clicker is unavailable');
    }
    return clicker;
  }

  async view(id: string) {
    return toClickerView(await this.getVisible(id), this.storage);
  }

  /**
   * 클릭커와 보관함 항목을 한 트랜잭션으로 만든다. 칸 확인을 먼저 하므로
   * 가득 찬 경우 파일도 행도 남지 않는다. 파일 저장이 실패하면 롤백된다.
   */
  async create(account: Account, upload: ParsedUpload) {
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      await this.inventory.assertFreeSlot(account.id, tx);
      await this.storeImages(id, 1, upload);
      await tx.clicker.create({
        data: {
          id,
          creatorId: account.id,
          name: upload.name,
          version: 1,
          idleKey: keyOf(id, 1, 'idle'),
          pressedKey: upload.pressed ? keyOf(id, 1, 'pressed') : null,
          specJson: upload.spec as Prisma.InputJsonObject,
          faceDetected: upload.faceDetected,
        },
      });
      const item = await this.inventory.add(
        account.id,
        id,
        'created',
        undefined,
        tx,
      );
      return { clickerId: id, inventoryItemId: item.id };
    });
  }

  /**
   * 제작자가 전체를 새로 올린다(pressed를 빼면 pressed 없음). 새 버전 키에 저장해 이전 버전 파일은 남긴다.
   * Clicker 행을 먼저 잠가 버전을 확정한 뒤 파일을 쓴다. 동시에 들어온 PUT은 순서대로
   * 처리되어 서로 다른 버전 키를 쓰므로 남의 파일을 덮어쓰지 않고, 저장이 실패하면 롤백된다.
   */
  async update(account: Account, id: string, upload: ParsedUpload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Clicker" WHERE "id" = ${id} FOR UPDATE`;
      const current = await this.ownedByCreator(account, id, tx);
      const version = current.version + 1;
      await this.storeImages(id, version, upload);
      await tx.clicker.update({
        where: { id },
        data: {
          name: upload.name,
          version,
          idleKey: keyOf(id, version, 'idle'),
          pressedKey: upload.pressed ? keyOf(id, version, 'pressed') : null,
          specJson: upload.spec as Prisma.InputJsonObject,
          faceDetected: upload.faceDetected,
        },
      });
      return { clickerId: id, version };
    });
  }

  /** 제작자 보관함에서만 빠진다. 받은 사람의 보관함은 그대로다. */
  async remove(account: Account, id: string): Promise<void> {
    await this.ownedByCreator(account, id);
    await this.prisma.$transaction([
      this.prisma.clicker.update({
        where: { id },
        data: { deletedByCreator: true },
      }),
      this.prisma.inventoryItem.deleteMany({
        where: { accountId: account.id, clickerId: id },
      }),
    ]);
  }

  private async ownedByCreator(
    account: Account,
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Clicker> {
    const clicker = await db.clicker.findUnique({ where: { id } });
    if (!clicker || clicker.deletedByCreator) {
      throw new AppError(404, 'CLICKER_NOT_FOUND', 'Clicker not found');
    }
    if (clicker.creatorId !== account.id) {
      throw new AppError(403, 'NOT_OWNER', 'Only the creator can do this');
    }
    if (clicker.hidden) {
      throw new AppError(404, 'CLICKER_UNAVAILABLE', 'Clicker is unavailable');
    }
    return clicker;
  }

  private async storeImages(
    id: string,
    version: number,
    upload: ParsedUpload,
  ): Promise<void> {
    await this.storage.put(
      keyOf(id, version, 'idle'),
      upload.idle,
      'image/png',
    );
    if (upload.pressed) {
      await this.storage.put(
        keyOf(id, version, 'pressed'),
        upload.pressed,
        'image/png',
      );
    }
  }
}
