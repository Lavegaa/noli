import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './app-error.js';

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** 모든 예외를 `{"error":{"code","message"}}` 형식으로 바꾼다. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, code, message } = this.describe(exception);
    res.status(status).json({ error: { code, message } });
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR',
        message: this.messageOf(exception),
      };
    }
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Internal server error',
    };
  }

  private messageOf(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    return message ?? exception.message;
  }
}
