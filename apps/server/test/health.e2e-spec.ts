import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDb } from './helpers/test-app.js';

describe('health & error format (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetDb();
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health -> 200 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown route -> 404 NOT_FOUND in the common error format', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });
});
