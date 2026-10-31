import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import {
  getOrCreateRequestId,
  getRequestContext,
  requestContextMiddleware,
} from '../../../src/common/request-context';

describe('request context', () => {
  it.each(['request-1', 'a.b:c_d', 'x'.repeat(128)])('accepts a safe request id: %s', (id) => {
    expect(getOrCreateRequestId({ headers: { 'x-request-id': id } })).toBe(id);
  });

  it.each(['', 'has spaces', 'x'.repeat(129), '<script>', 'line\r\nbreak', ['a', 'b'], undefined])(
    'replaces an unsafe request id: %s',
    (id) => {
      expect(getOrCreateRequestId({ headers: { 'x-request-id': id } })).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );

  it('preserves a context id over a different incoming header', () => {
    expect(getOrCreateRequestId({ id: 'existing', headers: { 'x-request-id': 'incoming' } })).toBe(
      'existing',
    );
  });

  it('isolates overlapping asynchronous requests and releases the context afterwards', async () => {
    expect(getRequestContext()).toBeUndefined();
    const observed = await Promise.all(
      ['first', 'second'].map(
        (id) =>
          new Promise<string>((resolve) => {
            const req = {
              headers: { 'x-request-id': id },
              ip: '127.0.0.1',
              get: () => `agent-${id}`,
            } as unknown as Request;
            const setHeader = jest.fn();
            requestContextMiddleware(req, { setHeader } as unknown as Response, () => {
              expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
              setImmediate(() => {
                expect(getRequestContext()).toEqual({
                  requestId: id,
                  ipAddress: '127.0.0.1',
                  userAgent: `agent-${id}`,
                });
                resolve(getRequestContext()!.requestId);
              });
            });
          }),
      ),
    );
    expect(observed).toEqual(['first', 'second']);
    expect(getRequestContext()).toBeUndefined();
  });
});
