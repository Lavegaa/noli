import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Account } from '../generated/prisma/client.js';

export type AuthedRequest = Request & { account: Account };

export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Account =>
    ctx.switchToHttp().getRequest<AuthedRequest>().account,
);
