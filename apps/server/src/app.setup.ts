import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ErrorFilter } from './common/error.filter.js';

/** main.ts와 e2e 테스트가 같은 전역 설정을 쓰도록 한 곳에 둔다. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
}
