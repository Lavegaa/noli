import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { SHARE_REDEEMED, type ShareRedeemedEvent } from './share-events.js';

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
    private readonly events: EventEmitter2,
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
    const isCreator = clicker.creatorId === account.id;
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
          data: { hidden: true, hiddenByScan: true },
        });
        throw new AppError(422, 'CONTENT_REJECTED', 'Image was rejected');
      }
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + GAME.shareCode.ttlDays * DAY_MS);
    const code = await this.insertCode({
      clickerId: clicker.id,
      creatorId: clicker.creatorId,
      issuerId: account.id,
      allowFriend,
      expiresAt,
    });
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
    await this.assertNotBlocked(account.id, share);
    const clicker = await this.clickers.getVisible(share.clickerId);
    return {
      clicker: toClickerView(clicker, this.storage),
      creator: { id: clicker.creatorId },
      expired: share.expiresAt <= this.clock.now(),
    };
  }

  /** 새로 수령했을 때만 `share.redeemed`를 발행한다. */
  async redeem(
    account: Account,
    code: string,
    addFriend: boolean,
  ): Promise<RedeemResult> {
    const share = await this.findCode(code);
    if (share.expiresAt <= this.clock.now()) throw invalidCode();
    await this.assertNotBlocked(account.id, share);
    const clicker = await this.clickers.getVisible(share.clickerId);
    // 내가 만든 클릭커이거나, 내가 발급한 코드면 받을 수 없다.
    if (clicker.creatorId === account.id || share.issuerId === account.id) {
      throw new AppError(409, 'OWN_CLICKER', 'This is your own clicker');
    }

    let outcome: { itemId: string; alreadyOwned: boolean };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        // 계정 행을 먼저 잠근다. 같은 계정의 중복 수령이 줄을 서므로
        // 뒤따르는 요청은 앞 요청이 넣은 항목을 보고 멱등 결과를 받는다.
        await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR NO KEY UPDATE`;
        // 사용 시점 확인: 제작자 삭제와 동시에 들어와도 지워진 클릭커는 받을 수 없다.
        // 삭제 트랜잭션이 이 행을 갱신하므로 공유 잠금으로 순서가 정해진다.
        const live = await tx.$queryRaw<{ deletedByCreator: boolean }[]>`
          SELECT "deletedByCreator" FROM "Clicker" WHERE "id" = ${clicker.id} FOR SHARE`;
        if (live[0]?.deletedByCreator ?? true) throw invalidCode();
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

    if (!outcome.alreadyOwned) {
      const event: ShareRedeemedEvent = {
        receiverId: account.id,
        creatorId: clicker.creatorId,
      };
      // 리스너가 실패를 스스로 처리하므로 기다려도 요청이 깨지지 않는다.
      await this.events.emitAsync(SHARE_REDEEMED, event);
    }

    const friend = await this.maybeAddFriend(account, share, addFriend);
    return {
      inventoryItemId: outcome.itemId,
      alreadyOwned: outcome.alreadyOwned,
      ...friend,
    };
  }

  /** 친구는 코드를 실제로 주고받은 두 사람(발급자 ↔ 수령자) 사이에만 생긴다. */
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
    const issuer = await this.prisma.account.findUnique({
      where: { id: share.issuerId },
    });
    if (!issuer || !capabilitiesOf(issuer, now).addFriend.allowed) {
      return { friendAdded: false };
    }
    await this.friends.link(account.id, issuer.id);
    return { friendAdded: true };
  }

  private async findCode(code: string): Promise<ShareCode> {
    const share = await this.prisma.shareCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!share) throw invalidCode();
    // 제작자가 지운 클릭커의 코드는 남아 있어도 없는 코드와 같다.
    const owner = await this.prisma.clicker.findUnique({
      where: { id: share.clickerId },
      select: { deletedByCreator: true },
    });
    if (!owner || owner.deletedByCreator) throw invalidCode();
    return share;
  }

  /** 발급자나 제작자와 차단 관계면 코드의 존재 자체를 숨긴다. */
  private async assertNotBlocked(
    accountId: string,
    share: Pick<ShareCode, 'creatorId' | 'issuerId'>,
  ) {
    for (const otherId of new Set([share.issuerId, share.creatorId])) {
      if (await this.blocks.isBlocked(accountId, otherId)) throw invalidCode();
    }
  }

  private async insertCode(
    data: Omit<ShareCode, 'code' | 'createdAt'>,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = this.drawCode();
      try {
        await this.prisma.shareCode.create({ data: { code, ...data } });
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
