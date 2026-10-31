import { describe, expect, it } from 'vitest';
import {
  cursorQuerySchema,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  limitSchema,
} from './pagination';

describe('cursor codec (UT-001-01)', () => {
  it('round-trips a cursor payload', () => {
    const cursor = encodeCursor({ id: '0193f7a2-1b2c-7d3e-8f40-123456789abc' });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({ id: '0193f7a2-1b2c-7d3e-8f40-123456789abc' });
  });

  it.each([
    ['empty', ''],
    ['not base64url', 'abc$%^'],
    ['not json', Buffer.from('not-json').toString('base64url')],
    ['wrong shape', Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url')],
    ['extra keys', Buffer.from(JSON.stringify({ id: 'a', admin: true })).toString('base64url')],
    ['empty id', Buffer.from(JSON.stringify({ id: '' })).toString('base64url')],
  ])('rejects a %s cursor', (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
  });
});

describe('limit schema (UT-001-02)', () => {
  it('defaults to 20', () => {
    expect(limitSchema.parse(undefined)).toBe(20);
    expect(cursorQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('coerces query-string numbers', () => {
    expect(limitSchema.parse('50')).toBe(50);
  });

  it.each([0, 101, 2.5, 'abc'])('rejects %s', (value) => {
    expect(limitSchema.safeParse(value).success).toBe(false);
  });
});
