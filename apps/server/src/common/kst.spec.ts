import { kstDay, kstWeekStart } from './kst.js';

describe('kst', () => {
  it('kstDay rolls over at UTC 15:00', () => {
    expect(kstDay(new Date('2026-10-31T14:59:59Z'))).toBe('2026-10-31');
    expect(kstDay(new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01');
  });

  it('kstWeekStart is Monday 00:00 KST', () => {
    expect(kstWeekStart(new Date('2026-11-01T15:00:00Z')).toISOString()).toBe(
      '2026-11-01T15:00:00.000Z',
    );
    expect(kstWeekStart(new Date('2026-11-01T14:59:59Z')).toISOString()).toBe(
      '2026-10-25T15:00:00.000Z',
    );
    // mid-week
    expect(kstWeekStart(new Date('2026-11-04T03:00:00Z')).toISOString()).toBe(
      '2026-11-01T15:00:00.000Z',
    );
  });
});
