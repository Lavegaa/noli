import { INestApplication, type Type } from '@nestjs/common';
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
  extraControllers: Type[] = [],
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
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  })
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

/** 테스트 DB(public 스키마)의 테이블을 비운다. 마이그레이션 테이블과 정적 카탈로그(Switch)는 제외. */
export async function resetDb(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename NOT IN ('_prisma_migrations', 'Switch')`,
    );
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}

/** 개발 DB(5432)를 실수로 비우지 않도록 테스트 DB(noli_test)만 허용한다. */
function assertTestDatabase(url: string | undefined): void {
  const dbName = url ? new URL(url).pathname.replace(/^\//, '') : '';
  if (dbName !== 'noli_test') {
    throw new Error(
      `resetDb() refused: DATABASE_URL must point at the noli_test database (got "${dbName}"). Run tests via pnpm test:e2e.`,
    );
  }
}
