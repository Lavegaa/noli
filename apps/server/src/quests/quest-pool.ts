import type { PlayRecordedEvent } from '../plays/play-events.js';

export interface QuestDef {
  key: string;
  target: number;
  reward: 1 | 2;
  event: 'play' | 'combo' | 'friend_play' | 'redeem';
  title: string;
}

export const QUEST_POOL: QuestDef[] = [
  {
    key: 'taps_1000',
    target: 1000,
    reward: 1,
    event: 'play',
    title: '클릭 1,000번',
  },
  {
    key: 'combo_30',
    target: 30,
    reward: 1,
    event: 'combo',
    title: '콤보 30 달성',
  },
  {
    key: 'friend_play_2',
    target: 2,
    reward: 1,
    event: 'friend_play',
    title: '친구 클릭커 2개 눌러보기',
  },
  {
    key: 'timed_3',
    target: 3,
    reward: 1,
    event: 'play',
    title: '10초 챌린지 3판',
  },
  {
    key: 'redeem_1',
    target: 1,
    reward: 2,
    event: 'redeem',
    title: '친구 클릭커 1개 받기',
  },
  {
    key: 'taps_3000',
    target: 3000,
    reward: 2,
    event: 'play',
    title: '클릭 3,000번',
  },
];

export const questDef = (key: string): QuestDef | undefined =>
  QUEST_POOL.find((q) => q.key === key);

/** `play` 이벤트 퀘스트가 한 번의 플레이로 올리는 양. `timed_3`만 10초 모드 판 수를 센다. */
export function playIncrement(def: QuestDef, e: PlayRecordedEvent): number {
  if (def.key === 'timed_3') return e.mode === 'timed10' ? 1 : 0;
  return e.taps;
}
