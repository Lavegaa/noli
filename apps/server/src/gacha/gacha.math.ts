import { GAME } from '../config/game.config.js';
import {
  SWITCH_CATALOG,
  type CatalogSwitch,
  type Grade,
} from './switch-catalog.js';

const { rates, pityPull } = GAME.gacha;

/**
 * 등급을 정한다. `r`은 [0,1). `pity`는 직전 epic 이상 이후 이미 뽑은 횟수라서
 * `pityPull - 1`이면 이번이 천장(epic 이상 확정)이다.
 */
export function pickGrade(r: number, pity: number): Grade {
  if (pity >= pityPull - 1) {
    return r < rates.epic / (rates.epic + rates.legend) ? 'epic' : 'legend';
  }
  let cumulative = 0;
  for (const grade of ['common', 'rare', 'epic'] as const) {
    cumulative += rates[grade];
    if (r < cumulative / 100) return grade;
  }
  return 'legend';
}

/** 해당 등급 안에서 균등하게 고른다. `r2`는 [0,1). */
export function pickSwitch(grade: Grade, r2: number): CatalogSwitch {
  const pool = SWITCH_CATALOG.filter((s) => s.grade === grade);
  return pool[Math.min(Math.floor(r2 * pool.length), pool.length - 1)];
}
