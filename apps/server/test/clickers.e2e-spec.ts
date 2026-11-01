import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { linkedAdult } from './helpers/accounts.js';
import { createTestApp, resetDb, type Fakes } from './helpers/test-app.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const spec = (name = '나무') =>
  JSON.stringify({ name, defaultEquip: { sound: 'pop', effect: 'spark' } });

describe('clickers & inventory (e2e)', () => {
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
  /** 업로드는 share 권한이 필요하다(Ruling M). */
  const maker = () => linkedAdult(app, `maker${seq++}`);
  const guest = () => `uid:guest${seq++}:anonymous`;

  const upload = (
    token: string,
    opts: {
      idle?: Buffer | null;
      pressed?: Buffer;
      spec?: string;
      faceDetected?: string;
    } = {},
  ) => {
    const req = http().post('/clickers').set(bearer(token));
    if (opts.idle !== null) {
      req.attach('idle', opts.idle ?? PNG, {
        filename: 'idle.png',
        contentType: 'image/png',
      });
    }
    if (opts.pressed) {
      req.attach('pressed', opts.pressed, {
        filename: 'pressed.png',
        contentType: 'image/png',
      });
    }
    req.field('spec', opts.spec ?? spec());
    req.field('faceDetected', opts.faceDetected ?? 'false');
    return req;
  };

  const usedSlots = async (token: string): Promise<number> =>
    (await http().get('/me').set(bearer(token))).body.usedSlots;

  it('upload -> 201, GET shows idleUrl stored in object storage', async () => {
    const token = await maker();
    expect(await usedSlots(token)).toBe(0);

    const res = await upload(token, { pressed: PNG }).expect(201);
    expect(res.body.clickerId).toBeDefined();
    expect(res.body.inventoryItemId).toBeDefined();
    expect(await usedSlots(token)).toBe(1);

    const got = await http()
      .get(`/clickers/${res.body.clickerId}`)
      .set(bearer(token))
      .expect(200);
    expect(got.body).toMatchObject({
      id: res.body.clickerId,
      name: '나무',
      version: 1,
      faceDetected: false,
      spec: { name: '나무', defaultEquip: { sound: 'pop', effect: 'spark' } },
    });
    expect(got.body.creator.id).toBeDefined();
    const idleKey = `clickers/${res.body.clickerId}/v1/idle.png`;
    expect(got.body.idleUrl).toBe(`memory://${idleKey}`);
    expect(got.body.pressedUrl).toBe(
      `memory://clickers/${res.body.clickerId}/v1/pressed.png`,
    );
    expect(fakes.storage.objects.get(idleKey)?.contentType).toBe('image/png');

    // 인벤토리 항목은 created, 제작자가 보면 default equip이 그대로 보인다.
    const inv = await http().get('/inventory').set(bearer(token)).expect(200);
    expect(inv.body.storageSlots).toBe(6);
    expect(inv.body.items).toHaveLength(1);
    expect(inv.body.items[0]).toMatchObject({
      id: res.body.inventoryItemId,
      source: 'created',
      clicker: { id: res.body.clickerId, name: '나무' },
      equip: { sound: 'pop', effect: 'spark' },
    });
  });

  it.each([
    ['guest', () => guest()],
    ['linked without birthdate', () => `uid:nobirth${seq++}:google.com`],
  ])(
    '%s upload -> 403 CAPABILITY_REQUIRED, nothing stored',
    async (_l, tok) => {
      const token = tok();
      const objectsBefore = fakes.storage.objects.size;
      const res = await upload(token).expect(403);
      expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
      expect(fakes.storage.objects.size).toBe(objectsBefore);
      expect(await usedSlots(token)).toBe(0);
    },
  );

  it('pending minor PUT on an existing clicker -> 403 CAPABILITY_REQUIRED', async () => {
    const token = await maker();
    const { body } = await upload(token).expect(201);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const me = (await http().get('/me').set(bearer(token))).body;
    await app.get(PrismaService).account.update({
      where: { id: me.id },
      data: { birthDate: new Date('2016-05-01'), consentStatus: 'pending' },
    });
    const res = await http()
      .put(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec())
      .expect(403);
    expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
    expect(res.body.error.message).toContain('CONSENT_REQUIRED');
  });

  it('pressed is optional -> pressedUrl omitted', async () => {
    const token = await maker();
    const res = await upload(token).expect(201);
    const got = await http()
      .get(`/clickers/${res.body.clickerId}`)
      .set(bearer(token))
      .expect(200);
    expect(got.body.pressedUrl).toBeUndefined();
  });

  it('name of 21 chars -> 400 VALIDATION_FAILED, nothing stored', async () => {
    const token = await maker();
    const res = await upload(token, { spec: spec('가'.repeat(21)) }).expect(
      400,
    );
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await usedSlots(token)).toBe(0);
  });

  it.each([
    ['not json', 'nope'],
    ['empty name', JSON.stringify({ name: '' })],
    ['whitespace-only name', JSON.stringify({ name: '   ' })],
    ['no name', JSON.stringify({ foo: 1 })],
    ['array', '[]'],
  ])('bad spec (%s) -> 400 VALIDATION_FAILED', async (_label, bad) => {
    const res = await upload(await maker(), { spec: bad }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('missing idle -> 400 VALIDATION_FAILED', async () => {
    const res = await upload(await maker(), { idle: null }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('non-png idle (declared image/png) -> 400 INVALID_IMAGE', async () => {
    const res = await upload(await maker(), { idle: JPEG }).expect(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('non-png pressed -> 400 INVALID_IMAGE', async () => {
    const res = await upload(await maker(), { pressed: JPEG }).expect(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('idle over 2MB -> 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await upload(await maker(), { idle: big }).expect(413);
  });

  it('full inventory -> 409 SLOT_FULL, no Clicker row, frees after delete', async () => {
    const token = await maker();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await upload(token).expect(201);
      ids.push(res.body.clickerId);
    }
    expect(await usedSlots(token)).toBe(6);
    const objectsBefore = fakes.storage.objects.size;

    const full = await upload(token).expect(409);
    expect(full.body.error.code).toBe('SLOT_FULL');
    expect(fakes.storage.objects.size).toBe(objectsBefore);
    const inv = await http().get('/inventory').set(bearer(token));
    expect(inv.body.items).toHaveLength(6);

    await http().delete(`/clickers/${ids[0]}`).set(bearer(token)).expect(204);
    expect(await usedSlots(token)).toBe(5);
    await upload(token).expect(201);
    expect(await usedSlots(token)).toBe(6);
  });

  it('SLOT_FULL leaves no extra Clicker row in the DB', async () => {
    const token = await maker();
    const me = (await http().get('/me').set(bearer(token))).body;
    for (let i = 0; i < 6; i++) await upload(token).expect(201);
    await upload(token).expect(409);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    expect(await prisma.clicker.count({ where: { creatorId: me.id } })).toBe(6);
  });

  it('PUT by creator -> version 2, key v2, GET reflects it', async () => {
    const token = await maker();
    const { body } = await upload(token).expect(201);
    const res = await http()
      .put(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec('새이름'))
      .field('faceDetected', 'true')
      .expect(200);
    expect(res.body).toMatchObject({ clickerId: body.clickerId, version: 2 });
    const key = `clickers/${body.clickerId}/v2/idle.png`;
    expect(fakes.storage.objects.has(key)).toBe(true);

    const got = await http()
      .get(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .expect(200);
    expect(got.body).toMatchObject({
      name: '새이름',
      version: 2,
      faceDetected: true,
      idleUrl: `memory://${key}`,
    });
    expect(got.body.pressedUrl).toBeUndefined();
    // 칸 수는 그대로
    expect(await usedSlots(token)).toBe(1);
  });

  it('concurrent PUTs are serialized: distinct versions, no key overwritten', async () => {
    const token = await maker();
    const { body } = await upload(token).expect(201);
    const pngWith = (tag: string) =>
      Buffer.concat([PNG.subarray(0, 8), Buffer.from(tag)]);
    const put = (tag: string) =>
      http()
        .put(`/clickers/${body.clickerId}`)
        .set(bearer(token))
        .attach('idle', pngWith(tag), {
          filename: 'idle.png',
          contentType: 'image/png',
        })
        .field('spec', spec(tag));

    const [a, b] = await Promise.all([put('AAAA'), put('BBBB')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.version, b.body.version].sort((x, y) => x - y)).toEqual([
      2, 3,
    ]);

    const key = (v: number) => `clickers/${body.clickerId}/v${v}/idle.png`;
    const bytesAt = (v: number) =>
      fakes.storage.objects.get(key(v))?.bytes.subarray(8).toString();
    const tagByVersion = new Map([
      [a.body.version, 'AAAA'],
      [b.body.version, 'BBBB'],
    ]);
    expect(bytesAt(2)).toBe(tagByVersion.get(2));
    expect(bytesAt(3)).toBe(tagByVersion.get(3));

    const got = await http()
      .get(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .expect(200);
    expect(got.body.version).toBe(3);
    expect(got.body.idleUrl).toBe(`memory://${key(3)}`);
    expect(got.body.name).toBe(tagByVersion.get(3));
  });

  it('PUT/DELETE by someone else -> 403 NOT_OWNER', async () => {
    const owner = await maker();
    const other = await maker();
    const { body } = await upload(owner).expect(201);

    const put = await http()
      .put(`/clickers/${body.clickerId}`)
      .set(bearer(other))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec())
      .expect(403);
    expect(put.body.error.code).toBe('NOT_OWNER');

    const del = await http()
      .delete(`/clickers/${body.clickerId}`)
      .set(bearer(other))
      .expect(403);
    expect(del.body.error.code).toBe('NOT_OWNER');

    await http()
      .get(`/clickers/${body.clickerId}`)
      .set(bearer(owner))
      .expect(200);
  });

  it('unknown clicker -> 404', async () => {
    const token = guest();
    await http()
      .get('/clickers/00000000-0000-0000-0000-000000000000')
      .set(bearer(token))
      .expect(404);
    await http().get('/clickers/not-a-uuid').set(bearer(token)).expect(404);
  });

  it('hidden clicker -> GET 404 CLICKER_UNAVAILABLE and absent from inventory', async () => {
    const token = await maker();
    const { body } = await upload(token).expect(201);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    await app.get(PrismaService).clicker.update({
      where: { id: body.clickerId },
      data: { hidden: true },
    });

    const res = await http()
      .get(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .expect(404);
    expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
    const inv = await http().get('/inventory').set(bearer(token));
    expect(inv.body.items).toHaveLength(0);
    expect(await usedSlots(token)).toBe(0);
  });

  it('creator delete removes the clicker everywhere, receivers included', async () => {
    const creator = await maker();
    const receiver = await maker();
    const { body } = await upload(creator).expect(201);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    const receiverAccount = (await http().get('/me').set(bearer(receiver)))
      .body;
    const item = await prisma.inventoryItem.create({
      data: {
        accountId: receiverAccount.id,
        clickerId: body.clickerId,
        source: 'received',
        receivedVersion: 1,
      },
    });
    expect(await usedSlots(receiver)).toBe(1);

    await http()
      .delete(`/clickers/${body.clickerId}`)
      .set(bearer(creator))
      .expect(204);
    expect(await usedSlots(creator)).toBe(0);
    expect(await usedSlots(receiver)).toBe(0);
    const row = await prisma.clicker.findUniqueOrThrow({
      where: { id: body.clickerId },
    });
    expect(row.deletedByCreator).toBe(true);

    const inv = await http()
      .get('/inventory')
      .set(bearer(receiver))
      .expect(200);
    expect(inv.body.items).toHaveLength(0);
    for (const token of [receiver, creator]) {
      const res = await http()
        .get(`/clickers/${body.clickerId}`)
        .set(bearer(token))
        .expect(404);
      expect(res.body.error.code).toBe('CLICKER_UNAVAILABLE');
    }
    await http()
      .put(`/inventory/${item.id}/equip`)
      .set(bearer(receiver))
      .send({ sound: 'pop' })
      .expect(404);
    // 제작자는 더 이상 수정할 수 없다.
    await http()
      .put(`/clickers/${body.clickerId}`)
      .set(bearer(creator))
      .attach('idle', PNG, { filename: 'idle.png', contentType: 'image/png' })
      .field('spec', spec())
      .expect(404);
  });

  it('inventory item override beats spec.defaultEquip, null when neither', async () => {
    const token = await maker();
    const { body } = await upload(token).expect(201);
    const noEquip = await upload(token, {
      spec: JSON.stringify({ name: '맨몸' }),
    }).expect(201);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    await app.get(PrismaService).inventoryItem.update({
      where: { id: body.inventoryItemId },
      data: { soundSwitchId: 'bell' },
    });
    const inv = await http().get('/inventory').set(bearer(token));
    const byId = new Map<string, { equip: unknown }>(
      inv.body.items.map((i: { id: string; equip: unknown }) => [i.id, i]),
    );
    expect(byId.get(body.inventoryItemId)?.equip).toEqual({
      sound: 'bell',
      effect: 'spark',
    });
    expect(byId.get(noEquip.body.inventoryItemId)?.equip).toEqual({
      sound: null,
      effect: null,
    });
  });

  describe('DELETE /inventory/:itemId', () => {
    it('removes own item, frees the slot; others get 404', async () => {
      const token = await maker();
      const other = await maker();
      const { body } = await upload(token).expect(201);
      await http()
        .delete(`/inventory/${body.inventoryItemId}`)
        .set(bearer(other))
        .expect(404);
      expect(await usedSlots(token)).toBe(1);
      await http()
        .delete(`/inventory/${body.inventoryItemId}`)
        .set(bearer(token))
        .expect(204);
      expect(await usedSlots(token)).toBe(0);
    });
  });

  it('GET /me usedSlots goes 0 -> 1 after upload and back after delete', async () => {
    const token = await maker();
    expect(await usedSlots(token)).toBe(0);
    const { body } = await upload(token).expect(201);
    expect(await usedSlots(token)).toBe(1);
    await http()
      .delete(`/clickers/${body.clickerId}`)
      .set(bearer(token))
      .expect(204);
    expect(await usedSlots(token)).toBe(0);
  });
});
