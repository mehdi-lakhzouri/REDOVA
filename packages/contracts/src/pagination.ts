import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_LIMIT)
  .default(DEFAULT_PAGE_LIMIT);

const cursorPayloadSchema = z.object({ id: z.string().min(1).max(200) }).strict();
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

/** Opaque cursor: base64url-encoded JSON of the last item's key. */
export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export const decodeCursor = (cursor: string): CursorPayload => {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidCursorError();
  try {
    const json: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return cursorPayloadSchema.parse(json);
  } catch {
    throw new InvalidCursorError();
  }
};

export const cursorQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().min(1).max(512).optional(),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;
