/** 베타 초기값. 게임 수치는 이 파일 한 곳에서만 바꾼다. */
export const GAME = {
  storage: { defaultSlots: 6, maxSlots: 30, slots3ProductBonus: 3 },
  shareCode: {
    length: 6,
    alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
    ttlDays: 7,
  },
  playValidation: {
    maxTapsPerSecond: 25,
    timed10MaxDurationMs: 10500,
    /** 자유 모드 한 판의 최대 길이(30분). 위조 기록으로 누적 탭 랭킹이 부풀지 않게 한다. */
    freeMaxDurationMs: 30 * 60 * 1000,
    /** score/taps/maxCombo 상한. int4 넘침(500)도 막는다. */
    maxCounter: 1_000_000,
  },
  /** 친구 기록 소식 푸시에 쓰는 제목. 친구 이름이 생기기 전까지 v1은 "친구"로 쓴다. */
  news: { friendLabel: '친구' },
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
