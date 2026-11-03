import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/ports.js';
import { capabilitiesOf, type Capability } from './capability.js';
import type { AuthedRequest } from './current-account.decorator.js';

const REQUIRED_CAPABILITY = 'requiredCapability';

/** 이 핸들러는 해당 권한이 허용된 계정만 호출할 수 있다. */
export const RequireCapability = (cap: Capability) =>
  SetMetadata(REQUIRED_CAPABILITY, cap);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const cap = this.reflector.getAllAndOverride<Capability | undefined>(
      REQUIRED_CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!cap) return true;

    const { account } = context.switchToHttp().getRequest<AuthedRequest>();
    const state = capabilitiesOf(account, this.clock.now())[cap];
    if (!state.allowed) {
      throw new AppError(
        403,
        'CAPABILITY_REQUIRED',
        `${cap} is not allowed: ${state.reason}`,
      );
    }
    return true;
  }
}
