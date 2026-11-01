import { HttpException } from '@nestjs/common';

/** 도메인 에러. `code`는 UPPER_SNAKE, 응답은 ErrorFilter가 공통 형식으로 만든다. */
export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}
