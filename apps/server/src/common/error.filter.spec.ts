import { UnauthorizedException, type ArgumentsHost } from '@nestjs/common';
import { vi } from 'vitest';
import { ErrorFilter } from './error.filter.js';

function hostWith(res: { status: ReturnType<typeof vi.fn> }): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

describe('ErrorFilter', () => {
  it('maps a framework 401 to the single UNAUTHENTICATED code', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    new ErrorFilter().catch(new UnauthorizedException('nope'), hostWith(res));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'nope' },
    });
  });
});
