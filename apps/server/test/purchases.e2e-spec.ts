import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GAME } from '../src/config/game.config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, resetDb, type Fakes } from './helpers/test-app.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('purchases (e2e)', () => {
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
    fakes.purchases.result = { valid: true, transactionId: `txn-${seq++}` };
  });

  const http = () => request(app.getHttpServer());
  const guest = () => `uid:guest${seq++}:anonymous`;
  const adult = async () => {
    const token = `uid:linked${seq++}:google.com`;
    await http()
      .put('/me/birthdate')
      .set(bearer(token))
      .send({ birthDate: '1990-01-01' });
    return token;
  };
  const verify = (token: string, body: Record<string, unknown> = {}) =>
    http()
      .post('/purchases/verify')
      .set(bearer(token))
      .send({ platform: 'ios', productId: 'slots_3', receipt: 'r', ...body });
  const slotsOf = async (token: string) =>
    (await http().get('/me').set(bearer(token))).body.storageSlots as number;
  const setSlots = async (token: string, storageSlots: number) => {
    const me = await http().get('/me').set(bearer(token));
    await prisma.account.update({
      where: { id: me.body.id },
      data: { storageSlots },
    });
  };

  it('guest -> 403 CAPABILITY_REQUIRED', async () => {
    const res = await verify(guest());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
  });

  it('valid receipt grants 3 slots (6 -> 9)', async () => {
    const token = await adult();
    const res = await verify(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ storageSlots: GAME.storage.defaultSlots + 3 });
    expect(await slotsOf(token)).toBe(9);
  });

  it('same transactionId twice -> stays 9, alreadyApplied', async () => {
    const token = await adult();
    await verify(token);
    const again = await verify(token);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ storageSlots: 9, alreadyApplied: true });
    expect(await slotsOf(token)).toBe(9);
  });

  it('two identical receipts in parallel -> 9, never 12, never 500', async () => {
    const token = await adult();
    const results = await Promise.all([verify(token), verify(token)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.filter((r) => r.body.alreadyApplied)).toHaveLength(1);
    expect(await slotsOf(token)).toBe(9);
    expect(
      await prisma.purchase.count({
        where: { transactionId: fakes.purchases.result.transactionId },
      }),
    ).toBe(1);
  });

  it('transactionId already used by another account -> 409, nothing granted', async () => {
    const first = await adult();
    const second = await adult();
    await verify(first);
    const res = await verify(second);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSACTION_ALREADY_USED');
    expect(await slotsOf(second)).toBe(6);
    expect(await slotsOf(first)).toBe(9);
  });

  it('at max slots -> 409 SLOTS_AT_MAX, nothing granted or recorded', async () => {
    const token = await adult();
    await setSlots(token, GAME.storage.maxSlots);
    const res = await verify(token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOTS_AT_MAX');
    expect(await slotsOf(token)).toBe(GAME.storage.maxSlots);
    expect(
      await prisma.purchase.count({
        where: { transactionId: fakes.purchases.result.transactionId },
      }),
    ).toBe(0);
  });

  it('a grant that would pass the max is refused (28 + 3 > 30)', async () => {
    const token = await adult();
    await setSlots(token, GAME.storage.maxSlots - 2);
    const res = await verify(token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOTS_AT_MAX');
    expect(await slotsOf(token)).toBe(GAME.storage.maxSlots - 2);
  });

  it('exactly reaching the max is allowed (27 -> 30)', async () => {
    const token = await adult();
    await setSlots(token, GAME.storage.maxSlots - 3);
    const res = await verify(token);
    expect(res.status).toBe(200);
    expect(res.body.storageSlots).toBe(GAME.storage.maxSlots);
  });

  it('alreadyApplied wins even when the account is now at max', async () => {
    const token = await adult();
    await setSlots(token, GAME.storage.maxSlots - 3);
    await verify(token);
    const again = await verify(token);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({
      storageSlots: GAME.storage.maxSlots,
      alreadyApplied: true,
    });
  });

  it('invalid receipt -> 402 RECEIPT_INVALID, nothing granted', async () => {
    const token = await adult();
    fakes.purchases.result = { valid: false, transactionId: '' };
    const res = await verify(token);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('RECEIPT_INVALID');
    expect(await slotsOf(token)).toBe(6);
  });

  it('unknown product -> 400 UNKNOWN_PRODUCT', async () => {
    const token = await adult();
    const res = await verify(token, { productId: 'slots_999' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_PRODUCT');
    const proto = await verify(token, { productId: 'constructor' });
    expect(proto.body.error.code).toBe('UNKNOWN_PRODUCT');
  });
});
