import type { Clicker } from '../generated/prisma/client.js';
import type { ObjectStorage } from '../common/ports.js';

export interface ClickerView {
  id: string;
  name: string;
  version: number;
  creator: { id: string };
  idleUrl: string;
  pressedUrl?: string;
  spec: unknown;
  faceDetected: boolean;
}

/** GET /clickers/:id 와 GET /inventory 가 같이 쓰는 응답 형식. */
export function toClickerView(
  clicker: Clicker,
  storage: ObjectStorage,
): ClickerView {
  return {
    id: clicker.id,
    name: clicker.name,
    version: clicker.version,
    creator: { id: clicker.creatorId },
    idleUrl: storage.url(clicker.idleKey),
    ...(clicker.pressedKey
      ? { pressedUrl: storage.url(clicker.pressedKey) }
      : {}),
    spec: clicker.specJson,
    faceDetected: clicker.faceDetected,
  };
}
