import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * 연동(google.com) + 성인 생일까지 마친 계정의 토큰을 만든다. 업로드와 공유는
 * `share` 권한이 필요하므로(Ruling M) 클릭커를 만드는 테스트 계정은 이걸 쓴다.
 */
export async function linkedAdult(
  app: INestApplication,
  uid: string,
): Promise<string> {
  const token = `uid:${uid}:google.com`;
  await request(app.getHttpServer())
    .put('/me/birthdate')
    .set({ Authorization: `Bearer ${token}` })
    .send({ birthDate: '2000-01-01' })
    .expect(200);
  return token;
}
