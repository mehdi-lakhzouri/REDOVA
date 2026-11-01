import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { requireSession, type AuthenticatedRequest } from '../authz/authenticated-request';
import type { Env } from '../config/env';
import { ENV, REDIS } from '../config/tokens';
import { ApiException } from '../common/api-exception';

/** Shared per-account budget for media mutations (all kinds): 10 per 10 minutes, before parsing. */
@Injectable()
export class MediaMutationGuard implements CanActivate {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = requireSession(context.switchToHttp().getRequest<AuthenticatedRequest>()).user;
    if (!this.env.RATE_LIMIT_ENABLED) return true;
    const key = `redova:media:rate:${createHash('sha256').update(user.id).digest('hex')}`;
    const count = Number(
      await this.redis.eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end; return n",
        1,
        key,
      ),
    );
    if (count > 10) {
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', '600');
      throw new ApiException('RATE_LIMITED');
    }
    return true;
  }
}
