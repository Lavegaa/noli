/** 두 계정 id를 항상 a < b 로 정렬한다(Friendship 저장 순서, 차단/친구 잠금 키가 같은 쌍을 같게 본다). */
export const sorted = (x: string, y: string): [string, string] =>
  x < y ? [x, y] : [y, x];
