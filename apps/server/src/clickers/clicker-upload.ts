import { AppError } from '../common/app-error.js';
import { GAME } from '../config/game.config.js';

/** multer가 메모리에 올려 준 파일 중 쓰는 필드만. */
export interface UploadedImage {
  buffer: Buffer;
}

export interface ClickerUploadFiles {
  idle?: UploadedImage[];
  pressed?: UploadedImage[];
}

export interface ParsedUpload {
  name: string;
  spec: Record<string, unknown>;
  faceDetected: boolean;
  idle: Buffer;
  pressed: Buffer | null;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 파일 이름이나 Content-Type은 믿지 않고 매직 바이트로 png를 판별한다. */
export function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= PNG_MAGIC.length && bytes.subarray(0, 8).equals(PNG_MAGIC)
  );
}

const invalid = (message: string) =>
  new AppError(400, 'VALIDATION_FAILED', message);

/** 업로드 폼(POST/PUT 공통)을 검증하고 정리한다. 실패하면 AppError(400). */
export function parseUpload(
  files: ClickerUploadFiles | undefined,
  specRaw: string,
  faceDetectedRaw: string | undefined,
): ParsedUpload {
  const idle = files?.idle?.[0]?.buffer;
  if (!idle) throw invalid('idle image is required');
  const pressed = files?.pressed?.[0]?.buffer ?? null;
  if (!isPng(idle) || (pressed && !isPng(pressed))) {
    throw new AppError(400, 'INVALID_IMAGE', 'Images must be PNG');
  }

  let spec: unknown;
  try {
    spec = JSON.parse(specRaw);
  } catch {
    throw invalid('spec must be a JSON string');
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw invalid('spec must be a JSON object');
  }
  const name = (spec as { name?: unknown }).name;
  if (
    typeof name !== 'string' ||
    name.length < 1 ||
    Array.from(name).length > GAME.clicker.nameMaxLength
  ) {
    throw invalid(
      `spec.name must be 1-${GAME.clicker.nameMaxLength} characters`,
    );
  }

  if (
    faceDetectedRaw !== undefined &&
    faceDetectedRaw !== 'true' &&
    faceDetectedRaw !== 'false'
  ) {
    throw invalid('faceDetected must be true or false');
  }
  return {
    name,
    spec: spec as Record<string, unknown>,
    faceDetected: faceDetectedRaw === 'true',
    idle,
    pressed,
  };
}
