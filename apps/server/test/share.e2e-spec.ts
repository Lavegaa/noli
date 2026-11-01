import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GAME } from '../src/config/game.config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
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
  const linkedToken = () => `uid:linked${seq++}:google.com`;
  /** 연동 + 성인 생일까지 마친 계정 */
  const adult = async () => {
    const token = linkedToken();
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '2000-01-01' })
      .expect(200);
    return token;
  };
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
  /** 서로 다른 값 6개를 넣어 코드 충돌을 피한다. */
  const pushCode = () => {
    const base = (seq++ * 0.07) % 0.9;
    fakes.random.push(...[0, 1, 2, 3, 4, 5].map((i) => base + i * 0.011));
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

  it('guest calling share -> 403 CAPABILITY_REQUIRED', async () => {
    const maker = guest();
    const clickerId = await upload(maker);
    const res = await share(maker, clickerId).then((r) => r);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
  });

  it('linked adult share -> 6-char code in alphabet, link, expiry, faceWarning', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const res = await share(maker, clickerId, true).then((r) => r);
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
    const res = await share(other, clickerId).then((r) => r);
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
      const res = await share(maker, clickerId).then((r) => r);
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
    const { code, clickerId, maker } = await sharedCode();
    const res = await http()
      .get(`/share/${code}`)
      .set(bearer(guest()))
      .expect(200);
    expect(res.body.clicker.id).toBe(clickerId);
    expect(res.body.creator.id).toBeDefined();
    expect(res.body.expired).toBe(false);
    expect(maker).toBeDefined();
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
});
