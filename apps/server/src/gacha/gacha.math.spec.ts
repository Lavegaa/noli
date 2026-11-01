import { pickGrade, pickSwitch } from './gacha.math.js';

describe('pickGrade', () => {
  it('uses the 70/22/7/1 cumulative bands', () => {
    expect(pickGrade(0.0, 0)).toBe('common');
    expect(pickGrade(0.6999, 0)).toBe('common');
    expect(pickGrade(0.7, 0)).toBe('rare');
    expect(pickGrade(0.9199, 0)).toBe('rare');
    expect(pickGrade(0.92, 0)).toBe('epic');
    expect(pickGrade(0.9899, 0)).toBe('epic');
    expect(pickGrade(0.99, 0)).toBe('legend');
  });

  it('guarantees epic or legend on the 20th pull (pity 19), 7:1', () => {
    expect(pickGrade(0.0, 19)).toBe('epic');
    expect(pickGrade(0.8749, 19)).toBe('epic');
    expect(pickGrade(0.875, 19)).toBe('legend');
    expect(pickGrade(0.9999, 19)).toBe('legend');
    expect(pickGrade(0.0, 18)).toBe('common');
  });

  it('matches the published rates within 1.5 points over 10k uniform samples', () => {
    const n = 10_000;
    const counts = { common: 0, rare: 0, epic: 0, legend: 0 };
    for (let i = 0; i < n; i++) counts[pickGrade(i / n, 0)]++;
    const expected = { common: 70, rare: 22, epic: 7, legend: 1 };
    for (const grade of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(
        Math.abs((counts[grade] / n) * 100 - expected[grade]),
      ).toBeLessThan(1.5);
    }
  });
});

describe('pickSwitch', () => {
  it('picks uniformly inside the grade', () => {
    expect(pickSwitch('epic', 0.0).id).toBe('boing');
    expect(pickSwitch('epic', 0.99).id).toBe('spin90');
    expect(pickSwitch('legend', 0.0).id).toBe('laser');
    expect(pickSwitch('legend', 0.5).id).toBe('aura');
    expect(pickSwitch('common', 0.3).id).toBe('tactile');
  });

  it('always returns a switch of the requested grade', () => {
    for (const grade of ['common', 'rare', 'epic', 'legend'] as const) {
      expect(pickSwitch(grade, 0.999999).grade).toBe(grade);
    }
  });
});
