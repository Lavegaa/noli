import { Inject, Injectable } from '@nestjs/common';
import { capabilitiesOf, type CapabilityReason } from '../auth/capability.js';
import { BlocksService } from '../blocks/blocks.service.js';
import { toClickerView } from '../clickers/clicker-view.js';
import { ClickersService } from '../clickers/clickers.service.js';
import { AppError } from '../common/app-error.js';
import {
  CLOCK,
  IMAGE_SCANNER,
  OBJECT_STORAGE,
  RANDOM,
  type Clock,
  type ImageScanner,
  type ObjectStorage,
  type Random,
} from '../common/ports.js';
import { GAME } from '../config/game.config.js';
import { FriendsService } from '../friends/friends.service.js';
import type { Account, ShareCode } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { NewsService } from '../news/news.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_CODE_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';

export interface RedeemResult {
  inventoryItemId: string;
  alreadyOwned: boolean;
  friendAdded: boolean;
  friendBlockedReason?: CapabilityReason;
}

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickers: ClickersService,
    private readonly inventory: InventoryService,
    private readonly friends: FriendsService,
    private readonly blocks: BlocksService,
    private readonly news: NewsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: Random,
    @Inject(IMAGE_SCANNER) private readonly scanner: ImageScanner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** 제작자 또는 보관함 보유자만. 저장된 이미지를 스캔해 통과해야 코드가 나온다. */
  async create(account: Account, clickerId: string, allowFriend: boolean) {
    const clicker = await this.clickers.getVisible(clickerId);
    const holds = await this.prisma.inventoryItem.findUnique({
      where: { accountId_clickerId: { accountId: account.id, clickerId } },
    });
    const isCreator =
      clicker.creatorId === account.id && !clicker.deletedByCreator;
    if (!holds && !isCreator) {
      throw new AppError(403, 'NOT_OWNER', 'Only the owner can share this');
    }

    const keys = [
      clicker.idleKey,
      ...(clicker.pressedKey ? [clicker.pressedKey] : []),
    ];
    for (const key of keys) {
      const verdict = await this.scanner.scan(await this.storage.get(key));
      if (verdict.adult || verdict.violence) {
        await this.prisma.clicker.update({
          where: { id: clickerId },
          data: { hidden: true },
        });
        throw new AppError(422, 'CONTENT_REJECTED', 'Image was rejected');
      }
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + GAME.shareCode.ttlDays * DAY_MS);
    const code = await this.insertCode(
      clicker.id,
      clicker.creatorId,
      allowFriend,
      expiresAt,
    );
    const host = process.env.SHARE_HOST ?? 'noli.example.com';
    return {
      code,
      link: `https://${host}/s/${code}`,
      expiresAt,
      faceWarning: clicker.faceDetected,
    };
  }

  async preview(account: Account, code: string) {
    const share = await this.findCode(code);
    await this.assertNotBlocked(account.id, share.creatorId);
    const clicker = await this.clickers.getVisible(share.clickerId);
    return {
      clicker: toClickerView(clicker, this.storage),
      creator: { id: clicker.creatorId },
      expired: share.expiresAt <= this.clock.now(),
    };
  }

  /** Task 6의 `share.redeemed` 발행도 이 메서드 안에서 한다. */
  async redeem(
    account: Account,
    code: string,
    addFriend: boolean,
  ): Promise<RedeemResult> {
    const share = await this.findCode(code);
    if (share.expiresAt <= this.clock.now()) throw invalidCode();
    await this.assertNotBlocked(account.id, share.creatorId);
    const clicker = await this.clickers.getVisible(share.clickerId);
    if (clicker.creatorId === account.id) {
      throw new AppError(409, 'OWN_CLICKER', 'This is your own clicker');
    }

    let outcome: { itemId: string; alreadyOwned: boolean };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        // 계정 행을 먼저 잠근다. 같은 계정의 중복 수령이 줄을 서므로
        // 뒤따르는 요청은 앞 요청이 넣은 항목을 보고 멱등 결과를 받는다.
        await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;
        const existing = await tx.inventoryItem.findUnique({
          where: {
            accountId_clickerId: {
              accountId: account.id,
              clickerId: clicker.id,
            },
          },
        });
        if (existing) return { itemId: existing.id, alreadyOwned: true };
        await this.inventory.assertFreeSlot(account.id, tx);
        const item = await this.inventory.add(
          account.id,
          clicker.id,
          'received',
          clicker.version,
          tx,
        );
        await this.news.add(
          clicker.creatorId,
          'received',
          { clickerId: clicker.id, receiverId: account.id },
          tx,
        );
        return { itemId: item.id, alreadyOwned: false };
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // 다른 연결이 같은 (계정, 클릭커) 항목을 먼저 넣었다면 멱등 결과로 돌려준다.
      // 항목이 없으면 다른 문장의 유니크 위반이므로 원래 오류를 그대로 던진다.
      const item = await this.prisma.inventoryItem.findUnique({
        where: {
          accountId_clickerId: { accountId: account.id, clickerId: clicker.id },
        },
      });
      if (!item) throw e;
      outcome = { itemId: item.id, alreadyOwned: true };
    }

    const friend = await this.maybeAddFriend(account, share, addFriend);
    return {
      inventoryItemId: outcome.itemId,
      alreadyOwned: outcome.alreadyOwned,
      ...friend,
    };
  }

  private async maybeAddFriend(
    account: Account,
    share: ShareCode,
    addFriend: boolean,
  ): Promise<Pick<RedeemResult, 'friendAdded' | 'friendBlockedReason'>> {
    if (!addFriend || !share.allowFriend) return { friendAdded: false };
    const now = this.clock.now();
    const mine = capabilitiesOf(account, now).addFriend;
    if (!mine.allowed) {
      return { friendAdded: false, friendBlockedReason: mine.reason };
    }
    const creator = await this.prisma.account.findUnique({
      where: { id: share.creatorId },
    });
    if (!creator || !capabilitiesOf(creator, now).addFriend.allowed) {
      return { friendAdded: false };
    }
    await this.friends.link(account.id, creator.id);
    return { friendAdded: true };
  }

  private async findCode(code: string): Promise<ShareCode> {
    const share = await this.prisma.shareCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!share) throw invalidCode();
    return share;
  }

  /** 차단 관계면 코드의 존재 자체를 숨긴다. */
  private async assertNotBlocked(accountId: string, creatorId: string) {
    if (await this.blocks.isBlocked(accountId, creatorId)) throw invalidCode();
  }

  private async insertCode(
    clickerId: string,
    creatorId: string,
    allowFriend: boolean,
    expiresAt: Date,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = this.drawCode();
      try {
        await this.prisma.shareCode.create({
          data: { code, clickerId, creatorId, allowFriend, expiresAt },
        });
        return code;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new AppError(503, 'CODE_GENERATION_FAILED', 'Try again');
  }

  private drawCode(): string {
    const { alphabet, length } = GAME.shareCode;
    let code = '';
    for (let i = 0; i < length; i++) {
      code += alphabet[Math.floor(this.random.next() * alphabet.length)];
    }
    return code;
  }
}

const invalidCode = () =>
  new AppError(404, 'CODE_INVALID', 'Share code is invalid or expired');
