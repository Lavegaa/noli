import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, resetDb, type Fakes } from './helpers/test-app.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);
const spec = JSON.stringify({
  name: '나무',
  defaultEquip: { sound: 'pop', effect: 'stars' },
});

describe('switches, gacha, equip (e2e)', () => {
  let app: INestApplication;
  let fakes: Fakes;
  let prisma: PrismaService;
  let seq = 0;

  beforeAll(async () => {
    await resetDb();
    ({ app, fakes } = await createTestApp());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const user = async () => {
    const token = `uid:g${seq++}:google.com`;
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '2000-01-01' })
      .expect(200);
    return token;
  };
  const setShards = async (token: string, shards: number, pity = 0) => {
    const { firebaseUid } = { firebaseUid: token.split(':')[1] };
    await prisma.account.update({
      where: { firebaseUid },
      data: { shards, pityCounter: pity },
    });
  };
  const pull = (token: string, requestId = crypto.randomUUID()) =>
    http().post('/gacha/pull').set(bearer(token)).send({ requestId });
  const owned = async (token: string): Promise<string[]> =>
    (
      await http().get('/switches/owned').set(bearer(token)).expect(200)
    ).body.switches.map((s: { id: string }) => s.id);
  const upload = async (token: string): Promise<string> =>
    (
      await http()
        .post('/clickers')
        .set(bearer(token))
        .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
        .field('spec', spec)
        .field('faceDetected', 'false')
        .expect(201)
    ).body.clickerId;
  const firstItemId = async (token: string): Promise<string> =>
    (await http().get('/inventory').set(bearer(token)).expect(200)).body
      .items[0].id;

  describe('catalog and defaults', () => {
    it('grants clicky and press_basic to a new account exactly once', async () => {
      const token = await user();
      expect((await owned(token)).sort()).toEqual(['clicky', 'press_basic']);
      await http().get('/me').set(bearer(token)).expect(200);
      expect((await owned(token)).sort()).toEqual(['clicky', 'press_basic']);
    });

    it('does not double-grant or fail on concurrent first requests', async () => {
      const token = `uid:g${seq++}:google.com`;
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          http().get('/switches/owned').set(bearer(token)),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
      expect((await owned(token)).sort()).toEqual(['clicky', 'press_basic']);
    });
  });

  describe('GET /gacha/rates', () => {
    it('is public and publishes exact rates summing to 100', async () => {
      const res = await http().get('/gacha/rates').expect(200);
      expect(res.body.rates).toEqual({
        common: 70,
        rare: 22,
        epic: 7,
        legend: 1,
      });
      const sum = Object.values(
        res.body.rates as Record<string, number>,
      ).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
      expect(res.body.switches.legend.map((s: { id: string }) => s.id)).toEqual(
        ['laser', 'aura'],
      );
      expect(res.body.pity.pullCount).toBe(20);
      expect(res.body.equalWithinGrade).toEqual(expect.any(String));
      expect(res.body.equalWithinGrade.length).toBeGreaterThan(0);
      expect(res.body.pity.resetsOnEpicOrLegend).toBe(true);
      expect(res.body.pity.resetDescription).toEqual(expect.any(String));
      expect(res.body.pity.description).toEqual(expect.any(String));
      expect(res.body.shardsPerPull).toBe(5);
    });
  });

  describe('POST /gacha/pull', () => {
    it('409 NOT_ENOUGH_SHARDS with 4 shards, and nothing changes', async () => {
      const token = await user();
      await setShards(token, 4);
      const res = await pull(token).expect(409);
      expect(res.body.error.code).toBe('NOT_ENOUGH_SHARDS');
      const me = await http().get('/me').set(bearer(token)).expect(200);
      expect(me.body.shards).toBe(4);
    });

    it('pulls a fixed switch with 5 shards and spends them', async () => {
      const token = await user();
      await setShards(token, 5);
      fakes.random.push(0.0, 0.3); // common, index 1 of 5 commons -> tactile
      const res = await pull(token).expect(201);
      expect(res.body).toEqual({
        switch: expect.objectContaining({
          id: 'tactile',
          kind: 'sound',
          grade: 'common',
        }),
        grade: 'common',
        duplicate: false,
        refund: 0,
        shards: 0,
        pityCounter: 1,
      });
      expect(await owned(token)).toContain('tactile');
    });

    it('refunds shards for a duplicate common', async () => {
      const token = await user();
      await setShards(token, 5);
      fakes.random.push(0.0, 0.0); // common -> clicky (already owned)
      const res = await pull(token).expect(201);
      expect(res.body).toMatchObject({
        duplicate: true,
        refund: 1,
        shards: 1,
        grade: 'common',
      });
      expect((await owned(token)).sort()).toEqual(['clicky', 'press_basic']);
    });

    it('same requestId twice returns the same result and spends once', async () => {
      const token = await user();
      await setShards(token, 10);
      const requestId = crypto.randomUUID();
      fakes.random.push(0.0, 0.3); // the replay must not consume randomness
      const first = await pull(token, requestId).expect(201);
      const second = await pull(token, requestId).expect(201);
      expect(second.body).toEqual(first.body);
      const me = await http().get('/me').set(bearer(token)).expect(200);
      expect(me.body.shards).toBe(5);
    });

    it('same requestId concurrently spends once', async () => {
      const token = await user();
      await setShards(token, 5);
      const requestId = crypto.randomUUID();
      fakes.random.push(0.0, 0.3);
      const [a, b] = await Promise.all([
        pull(token, requestId),
        pull(token, requestId),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body).toEqual(a.body);
      const me = await http().get('/me').set(bearer(token)).expect(200);
      expect(me.body.shards).toBe(0);
      expect(await prisma.gachaPull.count({ where: { requestId } })).toBe(1);
    });

    it('different requestIds racing for one pull: one wins, one 409', async () => {
      const token = await user();
      await setShards(token, 5);
      fakes.random.push(0.0, 0.3);
      const [a, b] = await Promise.all([pull(token), pull(token)]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.error.code).toBe('NOT_ENOUGH_SHARDS');
      const me = await http().get('/me').set(bearer(token)).expect(200);
      expect(me.body.shards).toBe(0);
    });

    it('replays an old result even when shards are now too low', async () => {
      const token = await user();
      await setShards(token, 5);
      const requestId = crypto.randomUUID();
      fakes.random.push(0.0, 0.3);
      const first = await pull(token, requestId).expect(201);
      const again = await pull(token, requestId).expect(201);
      expect(again.body).toEqual(first.body);
    });

    it('rejects a requestId that belongs to another account', async () => {
      const alice = await user();
      const bob = await user();
      await setShards(alice, 5);
      await setShards(bob, 5);
      const requestId = crypto.randomUUID();
      fakes.random.push(0.0, 0.3);
      await pull(alice, requestId).expect(201);
      const res = await pull(bob, requestId).expect(409);
      expect(res.body.error.code).toBe('REQUEST_ID_CONFLICT');
      const me = await http().get('/me').set(bearer(bob)).expect(200);
      expect(me.body.shards).toBe(5);
    });

    it('400 for a non-uuid requestId', async () => {
      const token = await user();
      await http()
        .post('/gacha/pull')
        .set(bearer(token))
        .send({ requestId: 'nope' })
        .expect(400);
    });

    it('pity: 20th pull is epic or better and resets the counter', async () => {
      const token = await user();
      await setShards(token, 5, 19);
      fakes.random.push(0.0, 0.0); // would be common without pity
      const res = await pull(token).expect(201);
      expect(['epic', 'legend']).toContain(res.body.grade);
      expect(res.body.pityCounter).toBe(0);
      expect(
        (
          await prisma.account.findFirstOrThrow({
            where: { firebaseUid: token.split(':')[1] },
          })
        ).pityCounter,
      ).toBe(0);
    });

    it('a non-epic pull increments the pity counter', async () => {
      const token = await user();
      await setShards(token, 5, 7);
      fakes.random.push(0.75, 0.0); // rare
      const res = await pull(token).expect(201);
      expect(res.body.grade).toBe('rare');
      expect(res.body.pityCounter).toBe(8);
    });
  });

  describe('PUT /inventory/:itemId/equip', () => {
    it('shows the creator default equip on a received clicker', async () => {
      const creator = await user();
      const clickerId = await upload(creator);
      fakes.random.push(0.01, 0.12, 0.23, 0.34, 0.45, 0.56);
      const code = (
        await http()
          .post(`/clickers/${clickerId}/share`)
          .set(bearer(creator))
          .send({ allowFriend: false })
          .expect(201)
      ).body.code;
      const friend = await user();
      await http()
        .post(`/share/${code}/redeem`)
        .set(bearer(friend))
        .send({ addFriend: false })
        .expect(200);
      const inv = await http()
        .get('/inventory')
        .set(bearer(friend))
        .expect(200);
      expect(inv.body.items[0].equip).toEqual({
        sound: 'pop',
        effect: 'stars',
      });
    });

    it('equips owned switches and overrides the default', async () => {
      const token = await user();
      await upload(token);
      const itemId = await firstItemId(token);
      const res = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(token))
        .send({ sound: 'clicky' })
        .expect(200);
      expect(res.body.equip).toEqual({ sound: 'clicky', effect: 'stars' });
      const inv = await http().get('/inventory').set(bearer(token)).expect(200);
      expect(inv.body.items[0].equip).toEqual({
        sound: 'clicky',
        effect: 'stars',
      });
    });

    it('403 SWITCH_NOT_OWNED for a switch the account does not have', async () => {
      const token = await user();
      await upload(token);
      const itemId = await firstItemId(token);
      const res = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(token))
        .send({ sound: 'laser' })
        .expect(403);
      expect(res.body.error.code).toBe('SWITCH_NOT_OWNED');
      // nothing was applied, even for the valid half
      const partial = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(token))
        .send({ effect: 'press_basic', sound: 'laser' })
        .expect(403);
      expect(partial.body.error.code).toBe('SWITCH_NOT_OWNED');
      const inv = await http().get('/inventory').set(bearer(token)).expect(200);
      expect(inv.body.items[0].equip.effect).toBe('stars');
    });

    it('400 SWITCH_KIND_MISMATCH when the kind does not fit the slot', async () => {
      const token = await user();
      await upload(token);
      const itemId = await firstItemId(token);
      const res = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(token))
        .send({ sound: 'press_basic' })
        .expect(400);
      expect(res.body.error.code).toBe('SWITCH_KIND_MISMATCH');
    });

    it('400 VALIDATION_FAILED for null or empty slot values', async () => {
      const token = await user();
      await upload(token);
      const itemId = await firstItemId(token);
      for (const body of [{ sound: null }, { effect: null }, { sound: '' }]) {
        const res = await http()
          .put(`/inventory/${itemId}/equip`)
          .set(bearer(token))
          .send(body)
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('400 VALIDATION_FAILED for an empty body (nothing to equip)', async () => {
      const token = await user();
      await upload(token);
      const itemId = await firstItemId(token);
      const res = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(token))
        .send({})
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it("404 for someone else's item", async () => {
      const owner = await user();
      await upload(owner);
      const itemId = await firstItemId(owner);
      const other = await user();
      const res = await http()
        .put(`/inventory/${itemId}/equip`)
        .set(bearer(other))
        .send({ sound: 'clicky' })
        .expect(404);
      expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
    });
  });
});
