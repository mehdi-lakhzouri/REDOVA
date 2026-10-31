import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APIError } from '@redova/auth';
import { InvalidCursorError } from '@redova/contracts';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiException } from './api-exception';
import { ApiExceptionFilter } from './api-exception.filter';

const render = (exception: unknown) => {
  const json = vi.fn((_body: { error: { code: string } }) => undefined);
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  const filter = new ApiExceptionFilter();
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  filter.catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
};

describe('ApiExceptionFilter (UT-001-04)', () => {
  it('maps Zod validation errors with details', () => {
    const result = z.object({ limit: z.number() }).safeParse({ limit: 'x' });
    const { status, body } = render(new ZodValidationException(result.error!));
    expect(status).toBe(400);
    expect(body).toMatchObject({
      data: null,
      error: { code: 'VALIDATION_FAILED', details: [{ path: 'limit' }] },
    });
  });

  it.each([
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenException(), 403, 'FORBIDDEN_PERMISSION'],
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new BadRequestException(), 400, 'VALIDATION_FAILED'],
    [new InvalidCursorError(), 400, 'INVALID_CURSOR'],
    [new ApiException('LAST_PLATFORM_ADMIN'), 409, 'LAST_PLATFORM_ADMIN'],
  ])('maps %s', (exception, expectedStatus, code) => {
    const { status, body } = render(exception);
    expect(status).toBe(expectedStatus);
    expect(body.error.code).toBe(code);
  });

  it('keeps Better Auth error codes from auth.api calls', () => {
    const { status, body } = render(
      new APIError('BAD_REQUEST', {
        code: 'YOU_CANNOT_BAN_YOURSELF',
        message: 'You cannot ban yourself',
      }),
    );
    expect(status).toBe(400);
    expect(body.error).toEqual({
      code: 'YOU_CANNOT_BAN_YOURSELF',
      message: 'You cannot ban yourself',
    });
  });

  it('masks unknown errors without leaking the message', () => {
    const { status, body } = render(new Error('db password=secret'));
    expect(status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
