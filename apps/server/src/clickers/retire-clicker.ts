import type { Prisma } from '../generated/prisma/client.js';

/**
 * 제작자가 클릭커를 지운다: deletedByCreator로 표시해 모두에게 숨기고(받은 사람의 칸도 비워진다),
 * 이 클릭커의 공유 코드를 모두 없애고 제작자 보관함 항목을 지운다.
 * DELETE /clickers/:id 와 DELETE /inventory/:itemId(created 항목)가 같은 트랜잭션 안에서 쓴다.
 */
export async function retireClicker(
  tx: Prisma.TransactionClient,
  creatorId: string,
  clickerId: string,
): Promise<void> {
  await tx.clicker.update({
    where: { id: clickerId },
    data: { deletedByCreator: true },
  });
  await tx.shareCode.deleteMany({ where: { clickerId } });
  await tx.inventoryItem.deleteMany({
    where: { accountId: creatorId, clickerId },
  });
}
