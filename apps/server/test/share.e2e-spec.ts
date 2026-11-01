import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GAME } from '../src/config/game.config.js';
import { vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { linkedAdult } from './helpers/accounts.js';
import { createTestApp, resetDb, type Fakes } from './helpers/test-app.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);
const spec = JSON.stringify({
  name: '나무',
  defaultEquip: { sound: 'pop', effect: 'spark' },
});
const DAY_MS = 24 * 60 * 60 * 1000;

describe('share, redeem, friends (e2e)', () => {
  let app: INestApplication;
  let fakes: Fakes;
  let seq = 0;

  beforeAll(async () => {
    await resetDb();
    ({ app, fakes } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const guest = () => `uid:guest${seq++}:anonymous`;
  /** 연동 + 성인 생일까지 마친 계정 */
  const adult = () => linkedAdult(app, `linked${seq++}`);
  const idOf = async (token: string): Promise<string> =>
    (await http().get('/me').set(bearer(token))).body.id;
  const friendIds = async (token: string): Promise<string[]> =>
    (await http().get('/friends').set(bearer(token))).body.map(
      (f: { id: string }) => f.id,
    );
  const upload = async (token: string): Promise<string> => {
    const res = await http()
      .post('/clickers')
      .set(bearer(token))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec)
      .field('faceDetected', 'false')
      .expect(201);
    return res.body.clickerId;
  };
  /** 코드마다 다른 번호를 31진수 6자리로 넣어 코드 충돌을 피한다. */
  let codeSeq = 1;
  const pushCode = () => {
    const { alphabet, length } = GAME.shareCode;
    let n = codeSeq++;
    for (let i = 0; i < length; i++) {
      fakes.random.push(((n % alphabet.length) + 0.5) / alphabet.length);
      n = Math.floor(n / alphabet.length);
    }
  };
  const share = async (
    token: string,
    clickerId: string,
    allowFriend = false,
  ) => {
    pushCode();
    return http()
      .post(`/clickers/${clickerId}/share`)
      .set(bearer(token))
      .send({ allowFriend });
  };
  const sharedCode = async (allowFriend = false) => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const res = await share(maker, clickerId, allowFriend).then((r) => {
      expect(r.status).toBe(201);
      return r;
    });
    return { maker, clickerId, code: res.body.code as string };
  };
  const redeem = (token: string, code: string, addFriend = false) =>
    http().post(`/share/${code}/redeem`).set(bearer(token)).send({ addFriend });
  const inventory = async (token: string) =>
    (await http().get('/inventory').set(bearer(token))).body;

  it('guest holder calling share -> 403 CAPABILITY_REQUIRED', async () => {
    const { code, clickerId } = await sharedCode();
    const holder = guest();
    await redeem(holder, code).expect(200);
    const res = await share(holder, clickerId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
  });

  it('linked adult share -> 6-char code in alphabet, link, expiry, faceWarning', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const res = await share(maker, clickerId, true);
    expect(res.status).toBe(201);
    expect(res.body.code).toHaveLength(GAME.shareCode.length);
    expect(
      [...res.body.code].every((c) => GAME.shareCode.alphabet.includes(c)),
    ).toBe(true);
    expect(res.body.link).toMatch(
      new RegExp(`^https://[^/]+/s/${res.body.code}$`),
    );
    expect(new Date(res.body.expiresAt).getTime()).toBe(
      fakes.clock.now().getTime() + GAME.shareCode.ttlDays * DAY_MS,
    );
    expect(res.body.faceWarning).toBe(false);
  });

  it('someone who neither created nor holds the clicker -> 403 NOT_OWNER', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const other = await adult();
    const res = await share(other, clickerId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_OWNER');
  });

  it('colliding codes are redrawn (up to 5 times)', async () => {
    const maker = await adult();
    const a = await upload(maker);
    const b = await upload(maker);
    fakes.random.push(0.1, 0.1, 0.1, 0.1, 0.1, 0.1);
    const first = await http()
      .post(`/clickers/${a}/share`)
      .set(bearer(maker))
      .send({ allowFriend: false });
    expect(first.status).toBe(201);
    // 같은 값으로 한 번 충돌한 뒤 다른 값으로 성공
    fakes.random.push(
      0.1,
      0.1,
      0.1,
      0.1,
      0.1,
      0.1,
      0.6,
      0.6,
      0.6,
      0.6,
      0.6,
      0.6,
    );
    const second = await http()
      .post(`/clickers/${b}/share`)
      .set(bearer(maker))
      .send({ allowFriend: false });
    expect(second.status).toBe(201);
    expect(second.body.code).not.toBe(first.body.code);
  });

  it('scanner flags adult -> 422 CONTENT_REJECTED and clicker becomes hidden', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    fakes.scanner.result = { adult: true, violence: false };
    try {
      const res = await share(maker, clickerId);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CONTENT_REJECTED');
    } finally {
      fakes.scanner.result = { adult: false, violence: false };
    }
    await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(404);
  });

  it('guest redeems -> item added as received, friendAdded false with LINK_REQUIRED', async () => {
    const { code, clickerId } = await sharedCode(true);
    const receiver = guest();
    const res = await redeem(receiver, code, true);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      alreadyOwned: false,
      friendAdded: false,
      friendBlockedReason: 'LINK_REQUIRED',
    });
    const inv = await inventory(receiver);
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]).toMatchObject({
      id: res.body.inventoryItemId,
      source: 'received',
      clicker: { id: clickerId },
      equip: { sound: 'pop', effect: 'spark' },
    });
  });

  it('preview works for guests and reports expiry', async () => {
    const { code, clickerId } = await sharedCode();
    const res = await http()
      .get(`/share/${code}`)
      .set(bearer(guest()))
      .expect(200);
    expect(res.body.clicker.id).toBe(clickerId);
    expect(res.body.creator.id).toBeDefined();
    expect(res.body.expired).toBe(false);
    fakes.clock.advance(7 * DAY_MS + 60_000);
    try {
      const late = await http()
        .get(`/share/${code}`)
        .set(bearer(guest()))
        .expect(200);
      expect(late.body.expired).toBe(true);
    } finally {
      fakes.clock.advance(-(7 * DAY_MS + 60_000));
    }
  });

  it('unknown code -> 404 CODE_INVALID', async () => {
    const res = await redeem(guest(), 'ZZZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CODE_INVALID');
  });

  it('second redeem is idempotent: alreadyOwned true, still one item', async () => {
    const { code } = await sharedCode();
    const receiver = guest();
    const first = await redeem(receiver, code);
    const second = await redeem(receiver, code);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      alreadyOwned: true,
      inventoryItemId: first.body.inventoryItemId,
    });
    expect((await inventory(receiver)).items).toHaveLength(1);
  });

  it('concurrent redeems by one account -> no 500, exactly one item', async () => {
    const { code } = await sharedCode();
    const receiver = guest();
    await http().get('/me').set(bearer(receiver)); // 계정을 먼저 만든다
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => redeem(receiver, code)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(results.filter((r) => !r.body.alreadyOwned)).toHaveLength(1);
    expect((await inventory(receiver)).items).toHaveLength(1);
  });

  it('one free slot + concurrent duplicate redeems -> all 200, one new item, no SLOT_FULL', async () => {
    const { code } = await sharedCode();
    const receiver = await adult();
    for (let i = 0; i < GAME.storage.defaultSlots - 1; i++) {
      await upload(receiver);
    }
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => redeem(receiver, code)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => !r.body.alreadyOwned)).toHaveLength(1);
    expect((await inventory(receiver)).items).toHaveLength(
      GAME.storage.defaultSlots,
    );
  });

  describe('unique violation on the inventory insert', () => {
    const p2002 = () =>
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

    it('item won by another connection -> idempotent alreadyOwned', async () => {
      const { code, clickerId } = await sharedCode();
      const receiver = guest();
      const me = (await http().get('/me').set(bearer(receiver))).body.id;
      const prisma = app.get(PrismaService);
      const spy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(async () => {
          await prisma.inventoryItem.create({
            data: { accountId: me, clickerId, source: 'received' },
          });
          throw p2002();
        });
      try {
        const res = await redeem(receiver, code);
        expect(res.status).toBe(200);
        expect(res.body.alreadyOwned).toBe(true);
        expect((await inventory(receiver)).items).toHaveLength(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('unrelated P2002 (no item exists) -> original error rethrown, nothing added', async () => {
      const { code } = await sharedCode();
      const receiver = guest();
      const prisma = app.get(PrismaService);
      const spy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce(async () => {
          throw p2002();
        });
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      try {
        const res = await redeem(receiver, code);
        expect(res.status).toBe(500);
        expect((await inventory(receiver)).items).toHaveLength(0);
        expect(log).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        log.mockRestore();
      }
    });
  });

  it('full inventory -> 409 SLOT_FULL, items unchanged', async () => {
    const { code } = await sharedCode();
    const receiver = await adult();
    for (let i = 0; i < GAME.storage.defaultSlots; i++) await upload(receiver);
    const res = await redeem(receiver, code);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_FULL');
    expect((await inventory(receiver)).items).toHaveLength(
      GAME.storage.defaultSlots,
    );
  });

  it('after 7 days and 1 minute -> 404 CODE_INVALID', async () => {
    const { code } = await sharedCode();
    fakes.clock.advance(7 * DAY_MS + 60_000);
    try {
      const res = await redeem(guest(), code);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
    } finally {
      fakes.clock.advance(-(7 * DAY_MS + 60_000));
    }
  });

  it('both linked adults, allowFriend + addFriend -> visible in each GET /friends; DELETE removes', async () => {
    const { code, maker } = await sharedCode(true);
    const receiver = await adult();
    const res = await redeem(receiver, code, true);
    expect(res.body).toMatchObject({ friendAdded: true });
    expect(res.body.friendBlockedReason).toBeUndefined();

    const mine = (await http().get('/me').set(bearer(receiver))).body.id;
    const theirs = (await http().get('/me').set(bearer(maker))).body.id;
    const a = await http().get('/friends').set(bearer(receiver)).expect(200);
    const b = await http().get('/friends').set(bearer(maker)).expect(200);
    expect(a.body.map((f: { id: string }) => f.id)).toEqual([theirs]);
    expect(b.body.map((f: { id: string }) => f.id)).toEqual([mine]);
    expect(a.body[0].since).toBeDefined();

    // 다시 받아도 친구 행은 한 개
    await redeem(receiver, code, true).then((r) =>
      expect(r.body.friendAdded).toBe(true),
    );
    expect(
      (await http().get('/friends').set(bearer(receiver))).body,
    ).toHaveLength(1);

    await http().delete(`/friends/${theirs}`).set(bearer(receiver)).expect(204);
    expect((await http().get('/friends').set(bearer(maker))).body).toEqual([]);
    await http().delete(`/friends/${theirs}`).set(bearer(receiver)).expect(404);
  });

  it('allowFriend false -> redeem succeeds, no friendship', async () => {
    const { code } = await sharedCode(false);
    const receiver = await adult();
    const res = await redeem(receiver, code, true);
    expect(res.body.friendAdded).toBe(false);
    expect((await http().get('/friends').set(bearer(receiver))).body).toEqual(
      [],
    );
  });

  it('redeeming your own code -> 409 OWN_CLICKER', async () => {
    const { code, maker } = await sharedCode();
    const res = await redeem(maker, code);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OWN_CLICKER');
  });

  it('creator PUT -> receiver inventory shows the new version (by reference)', async () => {
    const { code, clickerId, maker } = await sharedCode();
    const receiver = guest();
    await redeem(receiver, code);
    expect((await inventory(receiver)).items[0].clicker.version).toBe(1);
    await http()
      .put(`/clickers/${clickerId}`)
      .set(bearer(maker))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec)
      .field('faceDetected', 'false')
      .expect(200);
    expect((await inventory(receiver)).items[0].clicker.version).toBe(2);
  });

  it('hidden clicker code cannot be redeemed', async () => {
    const { code, clickerId } = await sharedCode();
    const prisma = app.get(PrismaService);
    await prisma.clicker.update({
      where: { id: clickerId },
      data: { hidden: true },
    });
    const res = await redeem(guest(), code);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
  });
  describe('reshared codes (issuer vs creator)', () => {
    /** A가 만들고 B가 받아서 다시 공유한 코드 */
    const reshared = async (allowFriend: boolean) => {
      const { maker, clickerId, code: original } = await sharedCode(false);
      const holder = await adult();
      await redeem(holder, original).expect(200);
      const res = await share(holder, clickerId, allowFriend);
      expect(res.status).toBe(201);
      return { maker, holder, clickerId, code: res.body.code as string };
    };

    it('holder reshares with allowFriend -> redeemer befriends the holder, not the creator; creator still gets received news', async () => {
      const { maker, holder, code } = await reshared(true);
      const receiver = await adult();
      const res = await redeem(receiver, code, true);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        alreadyOwned: false,
        friendAdded: true,
      });

      const [receiverId, holderId] = await Promise.all([
        idOf(receiver),
        idOf(holder),
      ]);
      expect(await friendIds(receiver)).toEqual([holderId]);
      expect(await friendIds(holder)).toEqual([receiverId]);
      expect(await friendIds(maker)).toEqual([]);

      const news = (await http().get('/news').set(bearer(maker))).body as {
        type: string;
        payload: { receiverId: string };
      }[];
      expect(
        news.filter(
          (n) => n.type === 'received' && n.payload.receiverId === receiverId,
        ),
      ).toHaveLength(1);
      const holderNews = (await http().get('/news').set(bearer(holder)))
        .body as { type: string }[];
      expect(holderNews.filter((n) => n.type === 'received')).toHaveLength(0);
    });

    it('redeemer blocked the issuer -> preview and redeem 404 CODE_INVALID', async () => {
      const { holder, code } = await reshared(true);
      const receiver = await adult();
      const blockedId = await idOf(holder);
      await http()
        .post('/blocks')
        .set(bearer(receiver))
        .send({ accountId: blockedId })
        .expect(200);
      const preview = await http().get(`/share/${code}`).set(bearer(receiver));
      expect(preview.status).toBe(404);
      expect(preview.body.error.code).toBe('CODE_INVALID');
      const res = await redeem(receiver, code, true);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
      expect((await inventory(receiver)).items).toHaveLength(0);
    });

    it('redeemer blocked the creator -> reshared code is 404 CODE_INVALID too', async () => {
      const { maker, code } = await reshared(false);
      const receiver = await adult();
      const blockedId = await idOf(maker);
      await http()
        .post('/blocks')
        .set(bearer(receiver))
        .send({ accountId: blockedId })
        .expect(200);
      const res = await redeem(receiver, code);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
    });

    it('issuer or creator redeeming a reshared code -> 409 OWN_CLICKER', async () => {
      const { maker, holder, code } = await reshared(false);
      for (const token of [holder, maker]) {
        const res = await redeem(token, code);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('OWN_CLICKER');
      }
    });
  });

  it('concurrent mutual redeem (A takes B code while B takes A code) -> no 500', async () => {
    for (let round = 0; round < 5; round++) {
      const a = await sharedCode(true);
      const b = await sharedCode(true);
      const [ab, ba] = await Promise.all([
        redeem(a.maker, b.code, true),
        redeem(b.maker, a.code, true),
      ]);
      expect([ab.status, ba.status]).toEqual([200, 200]);
      expect((await inventory(a.maker)).items).toHaveLength(2);
      expect((await inventory(b.maker)).items).toHaveLength(2);
    }
  });

  describe('creator deletes the clicker (removed everywhere)', () => {
    it('DELETE /clickers/:id -> old and reshared codes 404 CODE_INVALID, receivers lose the item, holders cannot reshare', async () => {
      const { maker, clickerId, code } = await sharedCode();
      const receiver = guest();
      await redeem(receiver, code).expect(200);
      const holder = await adult();
      await redeem(holder, code).expect(200);
      const reshared = (await share(holder, clickerId)).body.code as string;

      await http()
        .delete(`/clickers/${clickerId}`)
        .set(bearer(maker))
        .expect(204);

      for (const c of [code, reshared]) {
        const res = await redeem(guest(), c);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('CODE_INVALID');
      }
      const prisma = app.get(PrismaService);
      expect(await prisma.shareCode.count({ where: { clickerId } })).toBe(0);
      expect((await inventory(receiver)).items).toHaveLength(0);
      expect((await inventory(holder)).items).toHaveLength(0);
      const res = await share(holder, clickerId);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
      const preview = await http().get(`/share/${code}`).set(bearer(guest()));
      expect(preview.status).toBe(404);
      expect(preview.body.error.code).toBe('CODE_INVALID');
    });

    it('a code that survives the delete (race) is still CODE_INVALID for preview and redeem', async () => {
      const { maker, clickerId, code } = await sharedCode();
      await http()
        .delete(`/clickers/${clickerId}`)
        .set(bearer(maker))
        .expect(204);
      const prisma = app.get(PrismaService);
      await prisma.shareCode.create({
        data: {
          code: 'RACE23',
          clickerId,
          creatorId: await idOf(maker),
          issuerId: await idOf(maker),
          allowFriend: false,
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
      for (const c of ['RACE23', code]) {
        const receiver = guest();
        expect((await redeem(receiver, c)).body.error.code).toBe(
          'CODE_INVALID',
        );
        expect((await inventory(receiver)).items).toHaveLength(0);
      }
    });

    it('deleting the created inventory item -> codes revoked, creator can no longer share or PUT it', async () => {
      const { maker, clickerId, code } = await sharedCode();
      const receiver = guest();
      await redeem(receiver, code).expect(200);
      const created = (await inventory(maker)).items.find(
        (i: { clicker: { id: string } }) => i.clicker.id === clickerId,
      );
      expect(created.source).toBe('created');

      await http()
        .delete(`/inventory/${created.id}`)
        .set(bearer(maker))
        .expect(204);

      const prisma = app.get(PrismaService);
      const row = await prisma.clicker.findUniqueOrThrow({
        where: { id: clickerId },
      });
      expect(row.deletedByCreator).toBe(true);
      const old = await redeem(guest(), code);
      expect(old.status).toBe(404);
      expect(old.body.error.code).toBe('CODE_INVALID');

      const again = await share(maker, clickerId);
      expect(again.status).toBe(404);
      expect(again.body.error.code).toBe('CLICKER_UNAVAILABLE');
      const put = await http()
        .put(`/clickers/${clickerId}`)
        .set(bearer(maker))
        .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
        .field('spec', spec)
        .field('faceDetected', 'false');
      expect(put.status).toBe(404);
      expect(put.body.error.code).toBe('CLICKER_NOT_FOUND');
      expect((await inventory(receiver)).items).toHaveLength(0);
    });

    it('deleting a received inventory item only removes it from my inventory', async () => {
      const { maker, clickerId, code } = await sharedCode();
      const receiver = guest();
      const { body } = await redeem(receiver, code).expect(200);
      await http()
        .delete(`/inventory/${body.inventoryItemId}`)
        .set(bearer(receiver))
        .expect(204);
      expect((await inventory(receiver)).items).toHaveLength(0);
      const prisma = app.get(PrismaService);
      const row = await prisma.clicker.findUniqueOrThrow({
        where: { id: clickerId },
      });
      expect(row.deletedByCreator).toBe(false);
      expect((await redeem(guest(), code)).status).toBe(200);
      expect((await inventory(maker)).items).toHaveLength(1);
    });
  });
});
