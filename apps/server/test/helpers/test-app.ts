import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  AUTH_VERIFIER,
  CLOCK,
  IMAGE_SCANNER,
  NOTIFIER,
  OBJECT_STORAGE,
  PURCHASE_VERIFIER,
  RANDOM,
} from '../../src/common/ports.js';
import {
  FakeAuth,
  FakeClock,
  FakePurchases,
  FakeScanner,
  MemoryStorage,
  RecordingNotifier,
  SeqRandom,
} from './fakes.js';

export interface Fakes {
  clock: FakeClock;
  random: SeqRandom;
  auth: FakeAuth;
  storage: MemoryStorage;
  scanner: FakeScanner;
  purchases: FakePurchases;
  notifier: RecordingNotifier;
}

export async function createTestApp(
  overrides: Partial<Fakes> = {},
): Promise<{ app: INestApplication; fakes: Fakes }> {
  const fakes: Fakes = {
    clock: new FakeClock(),
    random: new SeqRandom(),
    auth: new FakeAuth(),
    storage: new MemoryStorage(),
    scanner: new FakeScanner(),
    purchases: new FakePurchases(),
    notifier: new RecordingNotifier(),
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(fakes.clock)
    .overrideProvider(RANDOM)
    .useValue(fakes.random)
    .overrideProvider(AUTH_VERIFIER)
    .useValue(fakes.auth)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(fakes.storage)
    .overrideProvider(IMAGE_SCANNER)
    .useValue(fakes.scanner)
    .overrideProvider(PURCHASE_VERIFIER)
    .useValue(fakes.purchases)
    .overrideProvider(NOTIFIER)
    .useValue(fakes.notifier)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, fakes };
}

/** 테스트 DB(public 스키마)의 모든 테이블을 비운다. 마이그레이션 테이블은 제외. */
export async function resetDb(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
