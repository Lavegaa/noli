import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FriendsService } from '../src/friends/friends.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReportsService } from '../src/reports/reports.service.js';
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

describe('reports and blocks (e2e)', () => {
  let app: INestApplication;
  let fakes: Fakes;
  let prisma: PrismaService;
  let reports: ReportsService;
  let seq = 0;

  beforeAll(async () => {
    await resetDb();
    ({ app, fakes } = await createTestApp());
    prisma = app.get(PrismaService);
    reports = app.get(ReportsService);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const guest = () => `uid:guest${seq++}:anonymous`;
  const adult = async () => {
    const token = `uid:linked${seq++}:google.com`;
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '2000-01-01' })
      .expect(200);
    return token;
  };
  const idOf = async (token: string): Promise<string> =>
    (await http().get('/me').set(bearer(token))).body.id;
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
  const share = async (
    token: string,
    clickerId: string,
    allowFriend = false,
  ) => {
    const base = (seq++ * 0.07) % 0.9;
    fakes.random.push(...[0, 1, 2, 3, 4, 5].map((i) => base + i * 0.011));
    const res = await http()
      .post(`/clickers/${clickerId}/share`)
      .set(bearer(token))
      .send({ allowFriend })
      .expect(201);
    return res.body.code as string;
  };
  const redeem = (token: string, code: string, addFriend = false) =>
    http().post(`/share/${code}/redeem`).set(bearer(token)).send({ addFriend });
  const report = (token: string, clickerId: string, reason = 'face') =>
    http().post('/reports').set(bearer(token)).send({ clickerId, reason });
  const inventoryIds = async (token: string): Promise<string[]> =>
    (await http().get('/inventory').set(bearer(token))).body.items.map(
      (i: { clicker: { id: string } }) => i.clicker.id,
    );
  const reportOf = (reporterId: string, clickerId: string) =>
    prisma.report.findFirstOrThrow({ where: { reporterId, clickerId } });
  const publishReason = async (token: string) =>
    (await http().get('/me').set(bearer(token))).body.capabilities
      .publishMarket;
  /** 제작자 + 클릭커 + 수령자 2명(수령해서 보관함에 가진 상태) */
  const scene = async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const code = await share(maker, clickerId);
    const r1 = await adult();
    const r2 = await adult();
    await redeem(r1, code).expect(200);
    await redeem(r2, code).expect(200);
    return { maker, clickerId, code, r1, r2 };
  };

  describe('reports', () => {
    it('a receiver reporting hides the clicker from the creator, the reporter and other holders', async () => {
      const { maker, clickerId, r1, r2 } = await scene();
      expect(await inventoryIds(r2)).toContain(clickerId);

      const res = await report(r1, clickerId);
      expect(res.status).toBe(200);

      const view = await http()
        .get(`/clickers/${clickerId}`)
        .set(bearer(maker));
      expect(view.status).toBe(404);
      expect(view.body.error.code).toBe('CLICKER_UNAVAILABLE');
      expect(await inventoryIds(r2)).not.toContain(clickerId);
      expect(await inventoryIds(r1)).not.toContain(clickerId);
      expect(await inventoryIds(maker)).toContain(clickerId);
      const stored = await reportOf(await idOf(r1), clickerId);
      expect(stored.status).toBe('pending');
    });

    it('creator sees the reported clicker as under_review, can delete it, and it stays deleted after restore', async () => {
      const { maker, clickerId, r1, r2 } = await scene();
      await report(r1, clickerId).expect(200);

      const inv = await http().get('/inventory').set(bearer(maker));
      const mine = inv.body.items.find(
        (i: { clicker: { id: string } }) => i.clicker.id === clickerId,
      );
      expect(mine.status).toBe('under_review');
      const me = await http().get('/me').set(bearer(maker));
      expect(me.body.usedSlots).toBe(1);
      expect(await inventoryIds(r2)).not.toContain(clickerId);

      await http()
        .delete(`/clickers/${clickerId}`)
        .set(bearer(maker))
        .expect(204);

      const stored = await reportOf(await idOf(r1), clickerId);
      await reports.resolve(stored.id, 'restored');
      const view = await http()
        .get(`/clickers/${clickerId}`)
        .set(bearer(maker));
      expect(view.status).toBe(404);
      for (const t of [maker, r1, r2]) {
        expect(await inventoryIds(t)).not.toContain(clickerId);
      }
    });

    it('guests can report', async () => {
      const maker = await adult();
      const clickerId = await upload(maker);
      const res = await report(guest(), clickerId, 'inappropriate');
      expect(res.status).toBe(200);
      const view = await http()
        .get(`/clickers/${clickerId}`)
        .set(bearer(maker));
      expect(view.status).toBe(404);
    });

    it('POST /plays on a reported clicker -> 404 CLICKER_UNAVAILABLE', async () => {
      const { clickerId, r1, r2 } = await scene();
      await report(r1, clickerId).expect(200);
      const res = await http().post('/plays').set(bearer(r2)).send({
        clickerId,
        mode: 'free',
        score: 100,
        maxCombo: 5,
        taps: 10,
        durationMs: 5000,
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
    });

    it('redeeming a code of a reported clicker -> 404', async () => {
      const { clickerId, code, r1 } = await scene();
      await report(r1, clickerId).expect(200);
      const newcomer = await adult();
      const res = await redeem(newcomer, code);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
      expect(await inventoryIds(newcomer)).toHaveLength(0);
    });

    it('resolve(restored) makes the clicker visible again', async () => {
      const { maker, clickerId, r1, r2 } = await scene();
      await report(r1, clickerId).expect(200);
      const stored = await reportOf(await idOf(r1), clickerId);
      await reports.resolve(stored.id, 'restored');
      await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(200);
      expect(await inventoryIds(r2)).toContain(clickerId);
      expect((await reportOf(await idOf(r1), clickerId)).status).toBe(
        'restored',
      );
    });

    it('restoring one report keeps the clicker hidden while another report is open', async () => {
      const { maker, clickerId, r1, r2 } = await scene();
      await report(r1, clickerId).expect(200);
      await report(r2, clickerId).expect(200);
      const first = await reportOf(await idOf(r1), clickerId);
      await reports.resolve(first.id, 'restored');
      await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(404);
      const second = await reportOf(await idOf(r2), clickerId);
      await reports.resolve(second.id, 'restored');
      await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(200);
    });

    it('a scan-hidden clicker stays hidden after a report is restored', async () => {
      const maker = await adult();
      const clickerId = await upload(maker);
      fakes.scanner.result = { adult: true, violence: false };
      try {
        const rejected = await http()
          .post(`/clickers/${clickerId}/share`)
          .set(bearer(maker))
          .send({ allowFriend: false });
        expect(rejected.status).toBe(422);
      } finally {
        fakes.scanner.result = { adult: false, violence: false };
      }
      await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(404);

      await report(guest(), clickerId).expect(200);
      const stored = await prisma.report.findFirstOrThrow({
        where: { clickerId },
      });
      await reports.resolve(stored.id, 'restored');
      const view = await http()
        .get(`/clickers/${clickerId}`)
        .set(bearer(maker));
      expect(view.status).toBe(404);
      expect(view.body.error.code).toBe('CLICKER_UNAVAILABLE');
    });

    it('resolve(removed) keeps it hidden; unknown report -> 404', async () => {
      const { maker, clickerId, r1 } = await scene();
      await report(r1, clickerId).expect(200);
      const stored = await reportOf(await idOf(r1), clickerId);
      await reports.resolve(stored.id, 'removed');
      await http().get(`/clickers/${clickerId}`).set(bearer(maker)).expect(404);
      await expect(
        reports.resolve('00000000-0000-0000-0000-000000000000', 'removed'),
      ).rejects.toMatchObject({ status: 404, code: 'REPORT_NOT_FOUND' });
    });

    it('3 distinct reported clickers restrict the creator; restoring lifts it', async () => {
      const maker = await adult();
      const ids = [
        await upload(maker),
        await upload(maker),
        await upload(maker),
      ];
      expect((await publishReason(maker)).allowed).toBe(true);
      await report(guest(), ids[0]).expect(200);
      await report(guest(), ids[1]).expect(200);
      expect((await publishReason(maker)).allowed).toBe(true);
      await report(guest(), ids[2]).expect(200);
      expect(await publishReason(maker)).toEqual({
        allowed: false,
        reason: 'UPLOAD_RESTRICTED',
      });

      const reporterId = (
        await prisma.report.findMany({ where: { clickerId: ids[2] } })
      )[0];
      await reports.resolve(reporterId.id, 'restored');
      expect((await publishReason(maker)).allowed).toBe(true);
    });

    it('several reports on one clicker count once; removed still counts', async () => {
      const maker = await adult();
      const a = await upload(maker);
      const b = await upload(maker);
      const c = await upload(maker);
      for (let i = 0; i < 4; i++) await report(guest(), a).expect(200);
      await report(guest(), b).expect(200);
      expect((await publishReason(maker)).allowed).toBe(true);
      await report(guest(), c).expect(200);
      expect((await publishReason(maker)).reason).toBe('UPLOAD_RESTRICTED');
      const row = await prisma.report.findFirstOrThrow({
        where: { clickerId: c },
      });
      await reports.resolve(row.id, 'removed');
      expect((await publishReason(maker)).reason).toBe('UPLOAD_RESTRICTED');
    });

    it('same report repeated sequentially -> 200 and a single Report', async () => {
      const { clickerId, r1 } = await scene();
      await report(r1, clickerId).expect(200);
      await report(r1, clickerId, 'other').expect(200);
      await report(r1, clickerId).expect(200);
      expect(await prisma.report.count({ where: { clickerId } })).toBe(1);
    });

    it('concurrent duplicate reports -> all 200 and a single Report', async () => {
      const maker = await adult();
      const clickerId = await upload(maker);
      const reporter = guest();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => report(reporter, clickerId)),
      );
      expect(results.map((r) => r.status)).toEqual([
        200, 200, 200, 200, 200, 200,
      ]);
      expect(await prisma.report.count({ where: { clickerId } })).toBe(1);
    });

    it('concurrent reports of 3 different clickers still restrict the creator', async () => {
      const maker = await adult();
      const ids = [
        await upload(maker),
        await upload(maker),
        await upload(maker),
      ];
      const results = await Promise.all(ids.map((id) => report(guest(), id)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect((await publishReason(maker)).reason).toBe('UPLOAD_RESTRICTED');
    });

    it('validation: unknown clicker 404, own clicker 409, bad reason 400', async () => {
      const maker = await adult();
      const clickerId = await upload(maker);
      const missing = await report(
        guest(),
        '00000000-0000-0000-0000-000000000000',
      );
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('CLICKER_NOT_FOUND');
      const own = await report(maker, clickerId);
      expect(own.status).toBe(409);
      expect(own.body.error.code).toBe('OWN_CLICKER');
      await report(guest(), clickerId, 'nope').expect(400);
      await http()
        .post('/reports')
        .set(bearer(guest()))
        .send({ clickerId })
        .expect(400);
      const view = await http()
        .get(`/clickers/${clickerId}`)
        .set(bearer(maker));
      expect(view.status).toBe(200);
    });
  });

  describe('blocks', () => {
    it('C blocks B who holds C clicker: B loses it, cannot reshare, and B existing reshare code is dead', async () => {
      const c = await adult();
      const b = await adult();
      const d = await adult();
      const bId = await idOf(b);
      const clickerId = await upload(c);
      await redeem(b, await share(c, clickerId)).expect(200);
      const reshare = await share(b, clickerId);

      await http()
        .post('/blocks')
        .set(bearer(c))
        .send({ accountId: bId })
        .expect(200);

      expect(await inventoryIds(b)).not.toContain(clickerId);
      expect(await inventoryIds(c)).toContain(clickerId);
      const again = await http()
        .post(`/clickers/${clickerId}/share`)
        .set(bearer(b))
        .send({ allowFriend: false });
      expect(again.status).toBe(404);
      const res = await redeem(d, reshare);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
    });

    it('B blocks C (reverse direction) also strips B holding and B reshare code', async () => {
      const c = await adult();
      const b = await adult();
      const d = await adult();
      const cId = await idOf(c);
      const clickerId = await upload(c);
      await redeem(b, await share(c, clickerId)).expect(200);
      const reshare = await share(b, clickerId);

      await http()
        .post('/blocks')
        .set(bearer(b))
        .send({ accountId: cId })
        .expect(200);

      expect(await inventoryIds(b)).not.toContain(clickerId);
      const again = await http()
        .post(`/clickers/${clickerId}/share`)
        .set(bearer(b))
        .send({ allowFriend: false });
      expect(again.status).toBe(404);
      const res = await redeem(d, reshare);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
      expect(await inventoryIds(c)).toContain(clickerId);
    });

    it('a reshare code that survives (race) is still rejected when issuer and creator are blocked', async () => {
      const c = await adult();
      const b = await adult();
      const d = await adult();
      const clickerId = await upload(c);
      await redeem(b, await share(c, clickerId)).expect(200);
      const reshare = await share(b, clickerId);
      await prisma.block.create({
        data: { blockerId: await idOf(c), blockedId: await idOf(b) },
      });
      const res = await redeem(d, reshare);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CODE_INVALID');
    });

    it('B blocks A: B cannot redeem A code, and A cannot redeem B code (CODE_INVALID)', async () => {
      const a = await adult();
      const b = await adult();
      const aId = await idOf(a);
      const codeA = await share(a, await upload(a));
      const codeB = await share(b, await upload(b));
      await http()
        .post('/blocks')
        .set(bearer(b))
        .send({ accountId: aId })
        .expect(200);

      const fromB = await redeem(b, codeA);
      expect(fromB.status).toBe(404);
      expect(fromB.body.error.code).toBe('CODE_INVALID');
      const fromA = await redeem(a, codeB);
      expect(fromA.status).toBe(404);
      expect(fromA.body.error.code).toBe('CODE_INVALID');
    });

    it('unblocking restores redeeming; blocking and unblocking are idempotent', async () => {
      const a = await adult();
      const b = await adult();
      const aId = await idOf(a);
      const codeA = await share(a, await upload(a));
      for (let i = 0; i < 2; i++) {
        await http()
          .post('/blocks')
          .set(bearer(b))
          .send({ accountId: aId })
          .expect(200);
      }
      expect(await prisma.block.count({ where: { blockedId: aId } })).toBe(1);
      for (let i = 0; i < 2; i++) {
        await http().delete(`/blocks/${aId}`).set(bearer(b)).expect(204);
      }
      await redeem(b, codeA).expect(200);
    });

    it('cannot block yourself or an unknown account; guests can block', async () => {
      const a = await adult();
      const aId = await idOf(a);
      const self = await http()
        .post('/blocks')
        .set(bearer(a))
        .send({ accountId: aId });
      expect(self.status).toBe(400);
      const ghost = await http()
        .post('/blocks')
        .set(bearer(a))
        .send({ accountId: '00000000-0000-0000-0000-000000000000' });
      expect(ghost.status).toBe(404);
      expect(ghost.body.error.code).toBe('ACCOUNT_NOT_FOUND');
      await http()
        .post('/blocks')
        .set(bearer(guest()))
        .send({ accountId: aId })
        .expect(200);
    });

    it('blocking removes an existing friendship for both sides and it is not recreated', async () => {
      const a = await adult();
      const b = await adult();
      const aId = await idOf(a);
      const bId = await idOf(b);
      const code = await share(a, await upload(a), true);
      const redeemed = await redeem(b, code, true).expect(200);
      expect(redeemed.body.friendAdded).toBe(true);
      const friendsOf = async (t: string) =>
        (await http().get('/friends').set(bearer(t)).expect(200)).body;
      expect(await friendsOf(a)).toHaveLength(1);
      expect(await friendsOf(b)).toHaveLength(1);

      await http()
        .post('/blocks')
        .set(bearer(b))
        .send({ accountId: aId })
        .expect(200);
      expect(await friendsOf(a)).toEqual([]);
      expect(await friendsOf(b)).toEqual([]);

      await expect(
        app.get(FriendsService).link(aId, bId),
      ).rejects.toMatchObject({ status: 403, code: 'BLOCKED' });
      await http().delete(`/blocks/${aId}`).set(bearer(b)).expect(204);
      expect(await friendsOf(a)).toEqual([]);
    });
  });
});
