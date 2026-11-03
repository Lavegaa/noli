import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { QUEST_POOL } from '../src/quests/quest-pool.js';
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

interface QuestView {
  key: string;
  title: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

/** SeqRandom 값 하나가 풀에서 남은 후보의 인덱스 하나를 고른다(앞에서부터 순서대로). */
const pick = (...keys: string[]): number[] => {
  const remaining = QUEST_POOL.map((q) => q.key);
  return keys.map((key) => {
    const i = remaining.indexOf(key);
    const value = (i + 0.5) / remaining.length;
    remaining.splice(i, 1);
    return value;
  });
};

describe('daily quests (e2e)', () => {
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
    // 2026-01-07 12:00 KST
    fakes.clock.set('2026-01-07T03:00:00Z');
  });

  const http = () => request(app.getHttpServer());
  const user = async () => {
    const token = `uid:q${seq++}:google.com`;
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '2000-01-01' })
      .expect(200);
    return token;
  };
  const today = async (token: string): Promise<QuestView[]> =>
    (await http().get('/quests/today').set(bearer(token)).expect(200)).body;
  const shards = async (token: string): Promise<number> =>
    (await http().get('/me').set(bearer(token)).expect(200)).body.shards;
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
        taps: 100,
        durationMs: 20000,
        ...over,
      })
      .expect(201);
  const share = async (maker: string, clickerId: string): Promise<string> => {
    fakes.random.push(
      ...[0, 1, 2, 3, 4, 5].map((i) => ((seq * 0.07) % 0.9) + i * 0.011),
    );
    return (
      await http()
        .post(`/clickers/${clickerId}/share`)
        .set(bearer(maker))
        .send({ allowFriend: false })
        .expect(201)
    ).body.code;
  };
  const receive = async (maker: string, clickerId: string, to: string) => {
    const code = await share(maker, clickerId);
    await http()
      .post(`/share/${code}/redeem`)
      .set(bearer(to))
      .send({ addFriend: false })
      .expect(200);
  };
  const progressOf = (list: QuestView[], key: string) =>
    list.find((q) => q.key === key)?.progress;

  it('returns the same 4 quests when asked twice on the same day', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    const first = await today(token);
    expect(first).toHaveLength(4);
    expect(first.map((q) => q.key).sort()).toEqual(
      ['taps_1000', 'combo_30', 'timed_3', 'redeem_1'].sort(),
    );
    expect(first[0]).toEqual(
      expect.objectContaining({ progress: 0, claimed: false }),
    );
    fakes.random.push(0.99, 0.99, 0.99, 0.99);
    expect(await today(token)).toEqual(first);
  });

  it('creates quests once under concurrent first calls', async () => {
    const token = await user();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => http().get('/quests/today').set(bearer(token))),
    );
    for (const r of results) expect(r.status).toBe(200);
    const keys = results.map((r) =>
      (r.body as QuestView[])
        .map((q) => q.key)
        .sort()
        .join(),
    );
    expect(new Set(keys).size).toBe(1);
    const id = (await http().get('/me').set(bearer(token))).body.id;
    expect(await prisma.dailyQuest.count({ where: { accountId: id } })).toBe(4);
  });

  it('rolls over at KST midnight and does not carry progress', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    const clickerId = await upload(token);
    await today(token);
    await play(token, clickerId, { taps: 100, maxCombo: 10 });
    expect(progressOf(await today(token), 'taps_1000')).toBe(100);

    // 2026-01-07 14:59 UTC = 23:59 KST: still the same day
    fakes.clock.set('2026-01-07T14:59:00Z');
    expect(progressOf(await today(token), 'taps_1000')).toBe(100);

    // 15:00 UTC = 00:00 KST next day
    fakes.clock.set('2026-01-07T15:00:00Z');
    fakes.random.push(
      ...pick('taps_3000', 'friend_play_2', 'timed_3', 'redeem_1'),
    );
    const next = await today(token);
    expect(next.map((q) => q.key).sort()).toEqual(
      ['taps_3000', 'friend_play_2', 'timed_3', 'redeem_1'].sort(),
    );
    expect(next.every((q) => q.progress === 0)).toBe(true);
  });

  it('claims a completed quest once: shards +1', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    const clickerId = await upload(token);
    await today(token);
    await play(token, clickerId, {
      taps: 600,
      maxCombo: 10,
      durationMs: 60000,
    });
    await play(token, clickerId, {
      taps: 600,
      maxCombo: 10,
      durationMs: 60000,
    });
    expect(progressOf(await today(token), 'taps_1000')).toBe(1000);

    const before = await shards(token);
    const res = await http()
      .post('/quests/taps_1000/claim')
      .set(bearer(token))
      .expect(201);
    expect(res.body).toEqual({ shards: before + 1 });
    expect(await shards(token)).toBe(before + 1);
    expect(
      (await today(token)).find((q) => q.key === 'taps_1000')?.claimed,
    ).toBe(true);
    const again = await http()
      .post('/quests/taps_1000/claim')
      .set(bearer(token))
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_CLAIMED');
  });

  it('grants shards only once for concurrent claims', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    const clickerId = await upload(token);
    await today(token);
    await play(token, clickerId, {
      taps: 1000,
      maxCombo: 10,
      durationMs: 60000,
    });
    const before = await shards(token);
    const [a, b] = await Promise.all([
      http().post('/quests/taps_1000/claim').set(bearer(token)),
      http().post('/quests/taps_1000/claim').set(bearer(token)),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    expect(await shards(token)).toBe(before + 1);
  });

  it('rejects an incomplete claim with QUEST_INCOMPLETE', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    await today(token);
    const res = await http()
      .post('/quests/taps_1000/claim')
      .set(bearer(token))
      .expect(409);
    expect(res.body.error.code).toBe('QUEST_INCOMPLETE');
  });

  it('returns 404 for a quest that is not in today list', async () => {
    fakes.random.push(...pick('taps_1000', 'combo_30', 'timed_3', 'redeem_1'));
    const token = await user();
    await today(token);
    await http().post('/quests/taps_3000/claim').set(bearer(token)).expect(404);
  });

  it('counts combo (max), timed rounds and redeem', async () => {
    fakes.random.push(...pick('combo_30', 'timed_3', 'redeem_1', 'taps_3000'));
    const maker = await user();
    const token = await user();
    const mine = await upload(token);
    const theirs = await upload(maker);
    await today(token);
    await receive(maker, theirs, token);
    await play(token, mine, { maxCombo: 12, taps: 50 });
    await play(token, mine, { maxCombo: 7, taps: 50 });
    await play(token, mine, { mode: 'timed10', durationMs: 10000, taps: 50 });
    const list = await today(token);
    expect(progressOf(list, 'combo_30')).toBe(12);
    expect(progressOf(list, 'timed_3')).toBe(1);
    expect(progressOf(list, 'redeem_1')).toBe(1);
    expect(progressOf(list, 'taps_3000')).toBe(150);
    // alreadyOwned 재수령은 다시 세지 않는다
    const code = await share(maker, theirs);
    await http()
      .post(`/share/${code}/redeem`)
      .set(bearer(token))
      .send({ addFriend: false })
      .expect(200);
    expect(progressOf(await today(token), 'redeem_1')).toBe(1);
    // redeem 퀘스트는 보상 2
    const before = await shards(token);
    const res = await http()
      .post('/quests/redeem_1/claim')
      .set(bearer(token))
      .expect(201);
    expect(res.body.shards).toBe(before + 2);
  });

  it("does not count plays on the player's own clicker for friend_play", async () => {
    fakes.random.push(
      ...pick('friend_play_2', 'combo_30', 'timed_3', 'redeem_1'),
    );
    const token = await user();
    const mine = await upload(token);
    await today(token);
    await play(token, mine);
    await play(token, mine);
    expect(progressOf(await today(token), 'friend_play_2')).toBe(0);
  });

  it('counts each other-made clicker once for friend_play', async () => {
    fakes.random.push(
      ...pick('friend_play_2', 'combo_30', 'timed_3', 'redeem_1'),
    );
    const maker = await user();
    const token = await user();
    const a = await upload(maker);
    const b = await upload(maker);
    await receive(maker, a, token);
    await receive(maker, b, token);
    await today(token);
    await play(token, a);
    await play(token, a);
    expect(progressOf(await today(token), 'friend_play_2')).toBe(1);
    await play(token, b);
    expect(progressOf(await today(token), 'friend_play_2')).toBe(2);
  });

  it('does not fail the play request when quest progress cannot be saved', async () => {
    const token = await user();
    const mine = await upload(token);
    const spy = vi
      .spyOn(prisma, '$executeRaw')
      .mockRejectedValue(new Error('db down'));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await play(token, mine);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('quest progress (play) failed'),
      );
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
  });
});
