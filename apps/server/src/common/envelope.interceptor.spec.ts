import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { EnvelopeInterceptor } from './envelope.interceptor';

const contextWithStatus = (statusCode: number) =>
  ({
    switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
  }) as unknown as ExecutionContext;

const run = (body: unknown, statusCode = 200) =>
  lastValueFrom(
    new EnvelopeInterceptor().intercept(contextWithStatus(statusCode), {
      handle: () => of(body),
    } as CallHandler),
  );

describe('EnvelopeInterceptor (UT-001-03)', () => {
  it('wraps a plain object', async () => {
    await expect(run({ id: 'u1' })).resolves.toEqual({
      data: { id: 'u1' },
      meta: { requestId: '' },
      error: null,
    });
  });

  it('moves pagination of a Paginated result into meta', async () => {
    const pagination = { limit: 20, nextCursor: 'abc', hasMore: true };
    await expect(run({ items: [{ id: 'u1' }], pagination })).resolves.toEqual({
      data: [{ id: 'u1' }],
      meta: { requestId: '', pagination },
      error: null,
    });
  });

  it('wraps undefined as null data and returns no body for 204', async () => {
    await expect(run(undefined)).resolves.toEqual({
      data: null,
      meta: { requestId: '' },
      error: null,
    });
    await expect(run(undefined, 204)).resolves.toBeUndefined();
  });
});
