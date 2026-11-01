const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 날짜 `YYYY-MM-DD`. 한국은 서머타임이 없어 +9시간 고정이다. */
export function kstDay(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 그 시각이 속한 주의 시작(월요일 00:00 KST)을 UTC 시각으로 돌려준다. */
export function kstWeekStart(d: Date): Date {
  const shifted = d.getTime() + KST_OFFSET_MS;
  const midnight = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);
  const dow = new Date(midnight).getUTCDay(); // 0=일 .. 6=토
  const sinceMonday = (dow + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS - KST_OFFSET_MS);
}
