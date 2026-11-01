/** 베타 초기값. 게임 수치는 이 파일 한 곳에서만 바꾼다. */
export const GAME = {
  storage: { defaultSlots: 6, maxSlots: 30, slots3ProductBonus: 3 },
  shareCode: {
    length: 6,
    alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
    ttlDays: 7,
  },
  playValidation: { maxTapsPerSecond: 25, timed10MaxDurationMs: 10500 },
  gacha: {
    shardsPerPull: 5,
    rates: { common: 70, rare: 22, epic: 7, legend: 1 },
    duplicateRefund: { common: 1, rare: 2, epic: 3, legend: 5 },
    /** 직전 epic 이상 이후 이 횟수째 뽑기는 epic 이상 확정 */
    pityPull: 20,
  },
  quests: { dailyCount: 4, rewardMin: 1, rewardMax: 2 },
  clicker: { maxImageBytes: 2 * 1024 * 1024, nameMaxLength: 20 },
  report: { restrictUploadAt: 3 },
} as const;
