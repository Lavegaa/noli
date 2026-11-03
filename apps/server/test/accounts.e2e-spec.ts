import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RequireCapability } from '../src/auth/capability.guard.js';
import { createTestApp, resetDb, type Fakes } from './helpers/test-app.js';

@Controller('test-capability')
class CapabilityProbeController {
  @Get('share')
  @RequireCapability('share')
  share(): { ok: true } {
    return { ok: true };
  }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('accounts & capability gate (e2e)', () => {
  let app: INestApplication;
  let fakes: Fakes;

  beforeAll(async () => {
    await resetDb();
    ({ app, fakes } = await createTestApp({}, [CapabilityProbeController]));
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('no token -> 401 UNAUTHENTICATED', async () => {
    const res = await http().get('/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['malformed bearer token', { Authorization: 'Bearer garbage' }],
    ['non-bearer header', { Authorization: 'Basic abc' }],
  ])('%s -> 401 UNAUTHENTICATED', async (_label, headers) => {
    const res = await http().get('/me').set(headers).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('/health stays public', async () => {
    await http().get('/health').expect(200);
  });

  it('first call creates a guest account with default slots and no shards', async () => {
    const res = await http()
      .get('/me')
      .set(bearer('uid:kid0:anonymous'))
      .expect(200);
    expect(res.body).toMatchObject({
      linked: false,
      storageSlots: 6,
      usedSlots: 0,
      shards: 0,
    });
    expect(res.body.capabilities.share).toEqual({
      allowed: false,
      reason: 'LINK_REQUIRED',
    });
  });

  it('same uid twice -> same account id (upsert)', async () => {
    const a = await http().get('/me').set(bearer('uid:kid2:anonymous'));
    const b = await http().get('/me').set(bearer('uid:kid2:anonymous'));
    expect(a.body.id).toBeDefined();
    expect(b.body.id).toBe(a.body.id);
  });

  it('anonymous account calling a share-gated endpoint -> 403 CAPABILITY_REQUIRED', async () => {
    const res = await http()
      .get('/test-capability/share')
      .set(bearer('uid:kid1:anonymous'))
      .expect(403);
    expect(res.body.error.code).toBe('CAPABILITY_REQUIRED');
    expect(res.body.error.message).toContain('LINK_REQUIRED');
  });

  it('anonymous uid later linked with google.com -> same account, linked:true', async () => {
    const before = await http().get('/me').set(bearer('uid:kid3:anonymous'));
    const after = await http()
      .get('/me')
      .set(bearer('uid:kid3:anonymous,google.com'))
      .expect(200);
    expect(after.body.id).toBe(before.body.id);
    expect(after.body.linked).toBe(true);
    expect(after.body.capabilities.share.reason).toBe('BIRTHDATE_REQUIRED');
  });

  describe('PUT /me/birthdate', () => {
    const token = 'uid:kid4:google.com';

    it('adult -> not_required, share allowed afterwards', async () => {
      fakes.clock.set('2026-10-31T03:00:00Z');
      await http()
        .put('/me/birthdate')
        .set(bearer(token))
        .send({ birthDate: '1990-01-01' })
        .expect(200);
      await http().get('/test-capability/share').set(bearer(token)).expect(200);
    });

    it('under 14 -> pending, share gated with CONSENT_REQUIRED', async () => {
      const t = 'uid:kid5:google.com';
      await http()
        .put('/me/birthdate')
        .set(bearer(t))
        .send({ birthDate: '2016-05-01' })
        .expect(200);
      const res = await http()
        .get('/test-capability/share')
        .set(bearer(t))
        .expect(403);
      expect(res.body.error.message).toContain('CONSENT_REQUIRED');
    });

    it('set once: same value again is idempotent, a different value -> 409 BIRTHDATE_ALREADY_SET', async () => {
      const t = 'uid:kid6:google.com';
      const put = (birthDate: string) =>
        http().put('/me/birthdate').set(bearer(t)).send({ birthDate });
      await put('1995-03-03').expect(200);
      const again = await put('1995-03-03').expect(200);
      expect(again.body.capabilities.share).toEqual({ allowed: true });
      const changed = await put('1996-03-03').expect(409);
      expect(changed.body.error.code).toBe('BIRTHDATE_ALREADY_SET');
    });

    it('pending minor PUTs an adult date -> 409, capabilities stay CONSENT_REQUIRED', async () => {
      const t = 'uid:kid7:google.com';
      await http()
        .put('/me/birthdate')
        .set(bearer(t))
        .send({ birthDate: '2016-05-01' })
        .expect(200);
      const res = await http()
        .put('/me/birthdate')
        .set(bearer(t))
        .send({ birthDate: '1990-01-01' })
        .expect(409);
      expect(res.body.error.code).toBe('BIRTHDATE_ALREADY_SET');
      const me = await http().get('/me').set(bearer(t)).expect(200);
      expect(me.body.capabilities.share).toEqual({
        allowed: false,
        reason: 'CONSENT_REQUIRED',
      });
      await http().get('/test-capability/share').set(bearer(t)).expect(403);
    });

    it.each([
      ['missing birthDate', {}],
      ['numeric birthDate', { birthDate: 20000101 }],
      ['null birthDate', { birthDate: null }],
    ])('%s -> 400 VALIDATION_FAILED', async (_label, body) => {
      const res = await http()
        .put('/me/birthdate')
        .set(bearer('uid:kid8:google.com'))
        .send(body)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it.each(['2016-5-1', 'not-a-date', '2016-02-30', '2999-01-01', ''])(
      'rejects invalid birthDate %j -> 400 VALIDATION_FAILED',
      async (birthDate) => {
        const res = await http()
          .put('/me/birthdate')
          .set(bearer(token))
          .send({ birthDate })
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      },
    );
  });
});
