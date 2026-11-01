import { AppError } from '../../src/common/app-error.js';
import type {
  AuthVerifier,
  Clock,
  ImageScanner,
  Notifier,
  ObjectStorage,
  PurchaseVerifier,
  Random,
} from '../../src/common/ports.js';

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-01-05T00:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  set(date: Date | string): void {
    this.current = new Date(date);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** 큐에 넣은 값을 순서대로 돌려주고, 비면 `fallback`을 돌려준다. */
export class SeqRandom implements Random {
  private queue: number[] = [];
  constructor(private readonly fallback = 0.5) {}
  push(...values: number[]): void {
    this.queue.push(...values);
  }
  next(): number {
    return this.queue.shift() ?? this.fallback;
  }
}

/** 토큰 `"uid:<uid>:<providers,comma>"`을 해석한다. 예: `uid:kid1:anonymous` */
export class FakeAuth implements AuthVerifier {
  async verify(idToken: string): Promise<{ uid: string; providers: string[] }> {
    const [prefix, uid, providers] = idToken.split(':');
    if (prefix !== 'uid' || !uid || !providers) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired ID token');
    }
    return { uid, providers: providers.split(',') };
  }
}

export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes, contentType });
  }
  url(key: string): string {
    return `memory://${key}`;
  }
}

export class FakeScanner implements ImageScanner {
  result = { adult: false, violence: false };
  async scan(): Promise<{ adult: boolean; violence: boolean }> {
    return this.result;
  }
}

export class FakePurchases implements PurchaseVerifier {
  result: { valid: boolean; transactionId: string } = {
    valid: true,
    transactionId: 'txn-1',
  };
  async verify(): Promise<{ valid: boolean; transactionId: string }> {
    return this.result;
  }
}

export class RecordingNotifier implements Notifier {
  readonly sent: { accountId: string; title: string; body: string }[] = [];
  async notify(accountId: string, title: string, body: string): Promise<void> {
    this.sent.push({ accountId, title, body });
  }
}
