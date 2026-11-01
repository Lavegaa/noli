import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // generate 같은 DB 불필요 명령도 돌아가도록 빈 문자열을 허용한다.
    url: process.env.DATABASE_URL ?? '',
  },
});
