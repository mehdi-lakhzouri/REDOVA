import { z } from 'zod';

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
});

export const paginationMetaSchema = z.object({
  limit: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const metaSchema = z.object({
  requestId: z.string(),
  pagination: paginationMetaSchema.nullable().optional(),
});

/** `{ data, meta, error: null }` for a single resource. */
export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ data, meta: metaSchema, error: z.null() });

/** `{ data: T[], meta: { pagination }, error: null }` for a cursor-paginated collection. */
export const paginatedEnvelope = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: metaSchema.extend({ pagination: paginationMetaSchema }),
    error: z.null(),
  });

export const errorEnvelope = z.object({
  data: z.null(),
  meta: metaSchema,
  error: apiErrorSchema,
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type Meta = z.infer<typeof metaSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

export interface SuccessEnvelope<T> {
  data: T;
  meta: Meta;
  error: null;
}

/** Returned by services for collections; the envelope interceptor moves `pagination` into `meta`. */
export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export const isPaginated = (value: unknown): value is Paginated<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Paginated<unknown>).items) &&
  typeof (value as Paginated<unknown>).pagination === 'object';
