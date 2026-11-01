import { Global, Module } from '@nestjs/common';
import {
  AUTH_VERIFIER,
  CLOCK,
  IMAGE_SCANNER,
  NOTIFIER,
  OBJECT_STORAGE,
  PURCHASE_VERIFIER,
  RANDOM,
} from '../common/ports.js';
import { FcmNotifier } from './fcm-notifier.js';
import { FirebaseAuthVerifier } from './firebase-auth-verifier.js';
import { MathRandom } from './math-random.js';
import { NoopImageScanner } from './noop-image-scanner.js';
import { RejectingPurchaseVerifier } from './rejecting-purchase-verifier.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import { SystemClock } from './system-clock.js';

const PORTS = [
  { provide: CLOCK, useClass: SystemClock },
  { provide: RANDOM, useClass: MathRandom },
  { provide: AUTH_VERIFIER, useClass: FirebaseAuthVerifier },
  { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
  { provide: IMAGE_SCANNER, useClass: NoopImageScanner },
  { provide: PURCHASE_VERIFIER, useClass: RejectingPurchaseVerifier },
  { provide: NOTIFIER, useClass: FcmNotifier },
];

@Global()
@Module({
  providers: PORTS,
  exports: PORTS.map((p) => p.provide),
})
export class InfraModule {}
