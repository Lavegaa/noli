import type { PrismaClient } from '../generated/prisma/client.js';

export type Grade = 'common' | 'rare' | 'epic' | 'legend';
export type SwitchKind = 'sound' | 'effect';

export interface CatalogSwitch {
  id: string;
  kind: SwitchKind;
  grade: Grade;
  name: string;
  /** 모바일 엔진이 해석할 프리셋 이름 */
  assetJson: { preset: string };
}

const sw = (
  id: string,
  kind: SwitchKind,
  grade: Grade,
  name: string,
): CatalogSwitch => ({ id, kind, grade, name, assetJson: { preset: id } });

/** v1 카탈로그(사운드·이펙트만). 순서가 등급 안에서 뽑기 인덱스가 된다. */
export const SWITCH_CATALOG: readonly CatalogSwitch[] = [
  sw('clicky', 'sound', 'common', '클릭키'),
  sw('tactile', 'sound', 'common', '택타일'),
  sw('thock', 'sound', 'common', '턱'),
  sw('press_basic', 'effect', 'common', '기본 눌림'),
  sw('sparks', 'effect', 'common', '불꽃'),
  sw('pop', 'sound', 'rare', '팝'),
  sw('coin', 'sound', 'rare', '코인'),
  sw('stars', 'effect', 'rare', '별빛'),
  sw('shards', 'effect', 'rare', '조각 파편'),
  sw('boing', 'sound', 'epic', '보잉'),
  sw('spin90', 'effect', 'epic', '90도 회전'),
  sw('laser', 'sound', 'legend', '레이저'),
  sw('aura', 'effect', 'legend', '오라'),
];

/** 신규 계정이 기본으로 갖는 스위치(kind별 common 하나). */
export const DEFAULT_SWITCH_IDS = ['clicky', 'press_basic'] as const;

/** 카탈로그를 DB에 맞춘다. 몇 번을 돌려도 같은 결과다. */
export async function seedSwitchCatalog(
  db: Pick<PrismaClient, 'switch'>,
): Promise<void> {
  for (const s of SWITCH_CATALOG) {
    const data = {
      kind: s.kind,
      grade: s.grade,
      name: s.name,
      assetJson: s.assetJson,
    };
    await db.switch.upsert({
      where: { id: s.id },
      create: { id: s.id, ...data },
      update: data,
    });
  }
}
