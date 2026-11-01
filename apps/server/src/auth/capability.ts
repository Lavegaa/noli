import type { Account } from '../generated/prisma/client.js';

export type Capability = 'share' | 'addFriend' | 'purchase' | 'publishMarket';
export type CapabilityReason =
  | 'LINK_REQUIRED'
  | 'BIRTHDATE_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'UPLOAD_RESTRICTED';
export type CapabilityState = { allowed: boolean; reason?: CapabilityReason };

export const CAPABILITIES: readonly Capability[] = [
  'share',
  'addFriend',
  'purchase',
  'publishMarket',
];

const ADULT_AGE = 14;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `now`의 KST 달력 날짜 기준 만 나이. `birthDate`는 DATE 컬럼(UTC 자정)이다. */
function ageInKst(birthDate: Date, now: Date): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  let age = kst.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    kst.getUTCMonth() < birthDate.getUTCMonth() ||
    (kst.getUTCMonth() === birthDate.getUTCMonth() &&
      kst.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** 14세 미만이면 true. 생일 당일부터 14세로 본다. */
export function isUnder14(birthDate: Date, now: Date): boolean {
  return ageInKst(birthDate, now) < ADULT_AGE;
}

/** 설계 §6.10. 계정이 지금 어떤 권한을 쓸 수 있는지 계산하는 순수 함수. */
export function capabilitiesOf(
  account: Account,
  now: Date,
): Record<Capability, CapabilityState> {
  const common = commonReason(account, now);
  const result = {} as Record<Capability, CapabilityState>;
  for (const cap of CAPABILITIES) {
    const reason =
      common ??
      (cap === 'publishMarket' && account.uploadRestricted
        ? 'UPLOAD_RESTRICTED'
        : undefined);
    result[cap] = reason ? { allowed: false, reason } : { allowed: true };
  }
  return result;
}

function commonReason(
  account: Account,
  now: Date,
): CapabilityReason | undefined {
  if (account.linkedProviders.length === 0) return 'LINK_REQUIRED';
  if (!account.birthDate) return 'BIRTHDATE_REQUIRED';
  if (
    isUnder14(account.birthDate, now) &&
    account.consentStatus !== 'granted'
  ) {
    return 'CONSENT_REQUIRED';
  }
  return undefined;
}
