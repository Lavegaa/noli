export const SHARE_REDEEMED = 'share.redeemed';

/** 퀘스트가 구독한다. 새로 수령했을 때만 발행한다(이미 가진 클릭커 재수령은 제외). */
export interface ShareRedeemedEvent {
  receiverId: string;
  creatorId: string;
}
