import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorEnvelope, isPaginated, paginatedEnvelope, successEnvelope } from './envelope';

describe('envelope schemas', () => {
  it('accepts a success envelope', () => {
    const schema = successEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ data: { id: 'u1' }, meta: { requestId: 'r1' }, error: null }).success).toBe(true);
  });

  it('requires pagination meta on paginated envelopes', () => {
    const schema = paginatedEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ data: [], meta: { requestId: 'r1' }, error: null }).success).toBe(false);
    expect(
      schema.safeParse({
        data: [{ id: 'u1' }],
        meta: { requestId: 'r1', pagination: { limit: 20, nextCursor: null, hasMore: false } },
        error: null,
      }).success,
    ).toBe(true);
  });

  it('accepts an error envelope with details', () => {
    expect(
      errorEnvelope.safeParse({
        data: null,
        meta: { requestId: 'r1' },
        error: { code: 'VALIDATION_FAILED', message: 'Invalid', details: [{ path: 'limit', message: 'Too big' }] },
      }).success,
    ).toBe(true);
  });

  it('detects paginated service results', () => {
    expect(isPaginated({ items: [], pagination: { limit: 20, nextCursor: null, hasMore: false } })).toBe(true);
    expect(isPaginated({ id: 'x' })).toBe(false);
    expect(isPaginated(null)).toBe(false);
  });
});
