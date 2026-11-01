import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error.js';
import { AUTH_VERIFIER, type AuthVerifier } from '../common/ports.js';
import { AccountsService } from '../accounts/accounts.service.js';
import type { AuthedRequest } from './current-account.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

/** 전역 가드: Bearer 토큰을 검증하고 firebaseUid로 Account를 upsert해 `req.account`에 넣는다. */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: AccountsService,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const match = header ? /^Bearer (.+)$/.exec(header) : null;
    if (!match) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    const { uid, providers } = await this.verifier.verify(match[1]);
    const linkedProviders = providers.filter((p) => p !== 'anonymous');
    req.account = await this.accounts.ensure(uid, linkedProviders);
    return true;
  }
}
