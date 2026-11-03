import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { GAME } from '../src/config/game.config.js';
import { NewsService } from '../src/news/news.service.js';
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

describe('plays, rankings, news (e2e)', () => {
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
  beforeEach(() => {
    // 2026-01-05 is a Monday, 00:00 UTC = 09:00 KST. Tests assume this default.
    fakes.clock.set('2026-01-07T03:00:00Z');
    fakes.notifier.sent.length = 0;
  });

  const http = () => request(app.getHttpServer());
  const adult = async () => {
    const token = `uid:p${seq++}:google.com`;
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '2000-01-01' })
      .expect(200);
    return token;
  };
  const accountId = async (token: string): Promise<string> =>
    (await http().get('/me').set(bearer(token)).expect(200)).body.id;
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
  const redeem = async (
    maker: string,
    clickerId: string,
    receiver: string,
    addFriend: boolean,
  ) => {
    fakes.random.push(
      ...[0, 1, 2, 3, 4, 5].map((i) => ((seq * 0.07) % 0.9) + i * 0.011),
    );
    const code = (
      await http()
        .post(`/clickers/${clickerId}/share`)
        .set(bearer(maker))
        .send({ allowFriend: addFriend })
        .expect(201)
    ).body.code;
    await http()
      .post(`/share/${code}/redeem`)
      .set(bearer(receiver))
      .send({ addFriend })
      .expect(200);
  };
  const play = (
    token: string,
    clickerId: string,
    over: Record<string, unknown> = {},
  ) =>
    http()
      .post('/plays')
      .set(bearer(token))
      .send({
        clickerId,
        mode: 'free',
        score: 100,
        maxCombo: 5,
        taps: 10,
        durationMs: 5000,
        ...over,
      });

  /** maker가 만든 클릭커를 친구 friend가 받아 둔 상태 */
  const friendsWithClicker = async () => {
    const maker = await adult();
    const friend = await adult();
    const clickerId = await upload(maker);
    await redeem(maker, clickerId, friend, true);
    return { maker, friend, clickerId };
  };

  it('rejects over 25 taps/s with 422 PLAY_REJECTED and stores nothing', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const res = await play(maker, clickerId, { taps: 100, durationMs: 1000 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLAY_REJECTED');
    expect(await prisma.playRecord.count({ where: { clickerId } })).toBe(0);
  });

  it('rejects maxCombo > taps, durationMs < 1, and timed10 over 10500ms', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    for (const over of [
      { maxCombo: 11, taps: 10 },
      { durationMs: 0 },
      { mode: 'timed10', durationMs: 10501 },
    ]) {
      const res = await play(maker, clickerId, over);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PLAY_REJECTED');
    }
    const ok = await play(maker, clickerId, {
      mode: 'timed10',
      durationMs: 10500,
      taps: 100,
    });
    expect(ok.status).toBe(201);
  });

  it.each([
    ['score', { score: GAME.playValidation.maxCounter + 1 }],
    ['taps', { taps: GAME.playValidation.maxCounter + 1 }],
    ['maxCombo', { maxCombo: GAME.playValidation.maxCounter + 1 }],
    ['taps above int4', { taps: 2 ** 31 }],
    ['durationMs over 30 min', { durationMs: 30 * 60 * 1000 + 1 }],
    ['durationMs above int4', { durationMs: 2 ** 31 }],
  ])(
    '%s over the cap -> 400 VALIDATION_FAILED, nothing stored',
    async (_l, over) => {
      const maker = await adult();
      const clickerId = await upload(maker);
      const res = await play(maker, clickerId, over);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.playRecord.count({ where: { clickerId } })).toBe(0);
    },
  );

  it('values exactly at the caps are accepted (free 30 min round)', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const res = await play(maker, clickerId, {
      score: GAME.playValidation.maxCounter,
      durationMs: GAME.playValidation.freeMaxDurationMs,
      taps: 25 * 30 * 60,
      maxCombo: 25 * 30 * 60,
    });
    expect(res.status).toBe(201);
    expect(GAME.playValidation.freeMaxDurationMs).toBe(30 * 60 * 1000);
  });

  it('clicker not in inventory -> 403 NOT_IN_INVENTORY', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    const stranger = await adult();
    const res = await play(stranger, clickerId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_IN_INVENTORY');
  });

  it('hidden clicker -> 404 CLICKER_UNAVAILABLE before the inventory check', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    await prisma.clicker.update({
      where: { id: clickerId },
      data: { hidden: true },
    });
    const stranger = await adult();
    const res = await play(stranger, clickerId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
  });

  it('creator-deleted clicker -> receiver play 404 CLICKER_UNAVAILABLE', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    await http()
      .delete(`/clickers/${clickerId}`)
      .set(bearer(maker))
      .expect(204);
    const res = await play(friend, clickerId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
  });

  it('two plays: bestCombo is the max, totalTaps is the sum', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    await play(maker, clickerId, { maxCombo: 7, taps: 10, score: 50 }).expect(
      201,
    );
    await play(maker, clickerId, { maxCombo: 4, taps: 20, score: 90 }).expect(
      201,
    );
    const stat = await prisma.clickerStat.findFirstOrThrow({
      where: { clickerId },
    });
    expect(stat).toMatchObject({ bestCombo: 7, totalTaps: 30, bestScore: 90 });
  });

  it('emits play.recorded with the agreed payload', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    const { EventEmitter2 } = await import('@nestjs/event-emitter');
    const events: unknown[] = [];
    app.get(EventEmitter2).on('play.recorded', (e: unknown) => events.push(e));
    await play(friend, clickerId, { maxCombo: 8, taps: 12 }).expect(201);
    expect(events).toEqual([
      {
        accountId: await accountId(friend),
        clickerId,
        creatorId: await accountId(maker),
        mode: 'free',
        maxCombo: 8,
        taps: 12,
      },
    ]);
  });

  it('friend beating their best combo on my clicker -> one news + one push; non-beat adds nothing', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    await play(friend, clickerId, { maxCombo: 30, taps: 40 }).expect(201);
    const news = (await http().get('/news').set(bearer(maker)).expect(200))
      .body;
    const records = news.filter(
      (n: { type: string }) => n.type === 'friend_record',
    );
    expect(records).toHaveLength(1);
    expect(records[0].payload).toMatchObject({
      clickerId,
      friendId: await accountId(friend),
      maxCombo: 30,
    });
    expect(fakes.notifier.sent).toHaveLength(1);
    expect(fakes.notifier.sent[0]).toMatchObject({
      accountId: await accountId(maker),
    });
    expect(fakes.notifier.sent[0].body).toContain('30');

    await play(friend, clickerId, { maxCombo: 20, taps: 40 }).expect(201);
    const after = (await http().get('/news').set(bearer(maker)).expect(200))
      .body;
    expect(
      after.filter((n: { type: string }) => n.type === 'friend_record'),
    ).toHaveLength(1);
    expect(fakes.notifier.sent).toHaveLength(1);
  });

  it('friend_record news failure after the play committed -> still 201, push still sent, logged', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    const news = app.get(NewsService);
    const add = vi
      .spyOn(news, 'add')
      .mockRejectedValueOnce(new Error('news down'));
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      const res = await play(friend, clickerId, { maxCombo: 30, taps: 40 });
      expect(res.status).toBe(201);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('friend_record news failed'),
      );
    } finally {
      add.mockRestore();
      warn.mockRestore();
    }
    expect(await prisma.playRecord.count({ where: { clickerId } })).toBe(1);
    expect(fakes.notifier.sent).toHaveLength(1);
    expect(fakes.notifier.sent[0].accountId).toBe(await accountId(maker));
  });

  it('non-friend record and the creator’s own record make no friend news', async () => {
    const maker = await adult();
    const clickerId = await upload(maker);
    await play(maker, clickerId, { maxCombo: 9 }).expect(201);
    expect(fakes.notifier.sent).toHaveLength(0);
    const news = (await http().get('/news').set(bearer(maker)).expect(200))
      .body;
    expect(news).toEqual([]);
  });

  it('news: unread filter and mark read (own items only, idempotent)', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    await play(friend, clickerId, { maxCombo: 30, taps: 40 }).expect(201);
    const all = (await http().get('/news').set(bearer(maker)).expect(200)).body;
    // received (from redeem) + friend_record
    expect(all.map((n: { type: string }) => n.type).sort()).toEqual([
      'friend_record',
      'received',
    ]);
    const id = all[0].id;
    await http().post(`/news/${id}/read`).set(bearer(friend)).expect(404);
    await http().post(`/news/${id}/read`).set(bearer(maker)).expect(204);
    const first = await prisma.newsItem.findUniqueOrThrow({ where: { id } });
    fakes.clock.advance(1000);
    await http().post(`/news/${id}/read`).set(bearer(maker)).expect(204);
    const second = await prisma.newsItem.findUniqueOrThrow({ where: { id } });
    expect(second.readAt).toEqual(first.readAt);
    const unread = (
      await http().get('/news?unread=true').set(bearer(maker)).expect(200)
    ).body;
    expect(unread).toHaveLength(1);
    expect(unread[0].id).not.toBe(id);
  });

  it('weekly ranking drops last week, all-time keeps it; non-friends excluded', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    const stranger = await adult();
    const strangerClicker = await upload(stranger);
    await play(stranger, strangerClicker, { maxCombo: 99, taps: 99 }).expect(
      201,
    );

    // last week (clock: Wed 2026-01-07 -> previous week Wed)
    fakes.clock.set(
      new Date(new Date('2026-01-07T03:00:00Z').getTime() - 7 * DAY_MS),
    );
    await play(friend, clickerId, { maxCombo: 50, taps: 60 }).expect(201);
    fakes.clock.set('2026-01-07T03:00:00Z');
    await play(maker, clickerId, { maxCombo: 10, taps: 20 }).expect(201);

    const makerId = await accountId(maker);
    const friendId = await accountId(friend);
    const week = (
      await http()
        .get('/rankings/friends?metric=maxCombo&period=week')
        .set(bearer(maker))
        .expect(200)
    ).body;
    expect(week).toEqual([
      { accountId: makerId, value: 10, rank: 1, me: true },
      { accountId: friendId, value: 0, rank: 2, me: false },
    ]);
    const all = (
      await http()
        .get('/rankings/friends?metric=maxCombo&period=all')
        .set(bearer(maker))
        .expect(200)
    ).body;
    expect(all).toEqual([
      { accountId: friendId, value: 50, rank: 1, me: false },
      { accountId: makerId, value: 10, rank: 2, me: true },
    ]);
    const taps = (
      await http()
        .get('/rankings/friends?metric=totalTaps&period=all')
        .set(bearer(maker))
        .expect(200)
    ).body;
    expect(taps.map((r: { value: number }) => r.value)).toEqual([60, 20]);
  });

  it('creatorPopularity = received count + plays by others on my clickers', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    await play(friend, clickerId).expect(201);
    await play(friend, clickerId).expect(201);
    await play(maker, clickerId).expect(201); // own play does not count
    const res = (
      await http()
        .get('/rankings/friends?metric=creatorPopularity&period=all')
        .set(bearer(maker))
        .expect(200)
    ).body;
    const makerId = await accountId(maker);
    expect(res.find((r: { me: boolean }) => r.me)).toMatchObject({
      accountId: makerId,
      value: 3, // 1 received + 2 plays by friend
      rank: 1,
    });
  });

  it('creatorPopularity week branch counts only this week; hidden and deleted clickers drop out of every ranking', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker(); // received now (this week)
    // last week: friend plays (does not count for the week branch)
    fakes.clock.set(
      new Date(new Date('2026-01-07T03:00:00Z').getTime() - 7 * DAY_MS),
    );
    await play(friend, clickerId, { maxCombo: 40, taps: 40 }).expect(201);
    fakes.clock.set('2026-01-07T03:00:00Z');
    await play(friend, clickerId, { maxCombo: 30, taps: 30 }).expect(201);

    const makerId = await accountId(maker);
    const friendId = await accountId(friend);
    const rank = async (metric: string, period: string) =>
      (
        await http()
          .get(`/rankings/friends?metric=${metric}&period=${period}`)
          .set(bearer(maker))
          .expect(200)
      ).body as { accountId: string; value: number }[];
    const valueOf = (
      rows: { accountId: string; value: number }[],
      id: string,
    ) => rows.find((r) => r.accountId === id)?.value;

    expect(valueOf(await rank('creatorPopularity', 'week'), makerId)).toBe(2); // 1 received + 1 play
    expect(valueOf(await rank('creatorPopularity', 'all'), makerId)).toBe(3);
    expect(valueOf(await rank('maxCombo', 'all'), friendId)).toBe(40);

    await http()
      .delete(`/clickers/${clickerId}`)
      .set(bearer(maker))
      .expect(204);
    for (const period of ['week', 'all']) {
      expect(valueOf(await rank('creatorPopularity', period), makerId)).toBe(0);
      expect(valueOf(await rank('maxCombo', period), friendId)).toBe(0);
      expect(valueOf(await rank('totalTaps', period), friendId)).toBe(0);
    }
  });

  it('a report-hidden clicker no longer counts in rankings', async () => {
    const { maker, friend, clickerId } = await friendsWithClicker();
    await play(friend, clickerId, { maxCombo: 7, taps: 9 }).expect(201);
    const makerId = await accountId(maker);
    const friendId = await accountId(friend);
    await prisma.clicker.update({
      where: { id: clickerId },
      data: { hidden: true },
    });
    const get = async (metric: string) =>
      (
        await http()
          .get(`/rankings/friends?metric=${metric}&period=all`)
          .set(bearer(maker))
          .expect(200)
      ).body as { accountId: string; value: number }[];
    expect(
      (await get('totalTaps')).find((r) => r.accountId === friendId)?.value,
    ).toBe(0);
    expect(
      (await get('creatorPopularity')).find((r) => r.accountId === makerId)
        ?.value,
    ).toBe(0);
  });

  it('rejects an unknown metric/period with 400', async () => {
    const t = await adult();
    await http()
      .get('/rankings/friends?metric=nope&period=all')
      .set(bearer(t))
      .expect(400);
    await http()
      .get('/rankings/friends?metric=maxCombo&period=month')
      .set(bearer(t))
      .expect(400);
  });
});
