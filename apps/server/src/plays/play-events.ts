export const PLAY_RECORDED = 'play.recorded';

/** 퀘스트 리스너가 구독한다. 필드를 바꾸면 구독자도 바뀐다. */
export interface PlayRecordedEvent {
  accountId: string;
  clickerId: string;
  creatorId: string;
  mode: 'free' | 'timed10';
  maxCombo: number;
  taps: number;
}
