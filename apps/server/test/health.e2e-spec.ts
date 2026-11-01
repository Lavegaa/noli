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

  it('malformed JSON body -> 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('oversized body -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200_000) }))
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
