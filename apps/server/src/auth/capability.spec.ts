import type { Account } from '../generated/prisma/client.js';
import { capabilitiesOf } from './capability.js';

const NOW = new Date('2026-10-31T03:00:00Z'); // KST 12:00

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    firebaseUid: 'uid1',
    linkedProviders: ['google.com'],
    birthDate: null,
    consentStatus: 'not_required',
    storageSlots: 6,
    shards: 0,
    pityCounter: 0,
    uploadRestricted: false,
    createdAt: NOW,
    ...overrides,
  };
}

describe('capabilitiesOf', () => {
  it('anonymous only -> every capability LINK_REQUIRED', () => {
    const caps = capabilitiesOf(account({ linkedProviders: [] }), NOW);
    for (const cap of Object.values(caps)) {
      expect(cap).toEqual({ allowed: false, reason: 'LINK_REQUIRED' });
    }
  });

  it('linked without birthDate -> BIRTHDATE_REQUIRED', () => {
    expect(capabilitiesOf(account(), NOW).share).toEqual({
      allowed: false,
      reason: 'BIRTHDATE_REQUIRED',
    });
  });

  it('under 14 with consent pending -> CONSENT_REQUIRED', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('2016-05-01'),
        consentStatus: 'pending',
      }),
      NOW,
    );
    expect(caps.share).toEqual({ allowed: false, reason: 'CONSENT_REQUIRED' });
  });

  it('under 14 with consent granted -> allowed', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('2016-05-01'),
        consentStatus: 'granted',
      }),
      NOW,
    );
    expect(caps.share.allowed).toBe(true);
  });

  it('turns 14 today (birthday) -> allowed', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('2012-10-31'),
        consentStatus: 'pending',
      }),
      NOW,
    );
    expect(caps.share).toEqual({ allowed: true });
  });

  it('turns 14 tomorrow -> still CONSENT_REQUIRED', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('2012-11-01'),
        consentStatus: 'pending',
      }),
      NOW,
    );
    expect(caps.share.reason).toBe('CONSENT_REQUIRED');
  });

  it('uses the KST day: UTC 15:00 on 10-30 is already 10-31 in Seoul', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('2012-10-31'),
        consentStatus: 'pending',
      }),
      new Date('2026-10-30T15:00:00Z'),
    );
    expect(caps.share.allowed).toBe(true);
  });

  it('uploadRestricted -> publishMarket UPLOAD_RESTRICTED, share allowed', () => {
    const caps = capabilitiesOf(
      account({
        birthDate: new Date('1990-01-01'),
        uploadRestricted: true,
      }),
      NOW,
    );
    expect(caps.publishMarket).toEqual({
      allowed: false,
      reason: 'UPLOAD_RESTRICTED',
    });
    expect(caps.share.allowed).toBe(true);
  });
});
