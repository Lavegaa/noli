import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import type { ObjectStorage } from '../common/ports.js';

/** S3 호환 스토리지. 설정은 S3_* 환경변수(.env.example 참고). */
@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly publicBaseUrl = (
    process.env.S3_PUBLIC_BASE_URL ?? ''
  ).replace(/\/$/, '');
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? 'ap-northeast-2',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        }
      : undefined,
  });

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) throw new Error(`Empty object body: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  url(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
