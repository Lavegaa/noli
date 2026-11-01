export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('CLOCK');

export interface Random {
  /** [0, 1) */
  next(): number;
}
export const RANDOM = Symbol('RANDOM');

export interface AuthVerifier {
  verify(idToken: string): Promise<{ uid: string; providers: string[] }>;
}
export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export interface ObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  url(key: string): string;
}
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface ImageScanner {
  scan(bytes: Buffer): Promise<{ adult: boolean; violence: boolean }>;
}
export const IMAGE_SCANNER = Symbol('IMAGE_SCANNER');

export interface PurchaseVerifier {
  verify(
    platform: 'ios' | 'android',
    productId: string,
    receipt: string,
  ): Promise<{ valid: boolean; transactionId: string }>;
}
export const PURCHASE_VERIFIER = Symbol('PURCHASE_VERIFIER');

export interface Notifier {
  notify(accountId: string, title: string, body: string): Promise<void>;
}
export const NOTIFIER = Symbol('NOTIFIER');
