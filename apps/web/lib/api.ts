import type { ApiError, Meta, PaginationMeta } from '@redova/contracts';

/** Error raised for a REDOVA `{ data: null, meta, error }` response; branch on `code`, not message. */
export class RedovaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'RedovaApiError';
  }
}

export interface ApiResult<T> {
  data: T;
  pagination: PaginationMeta | null;
}

/**
 * Calls the REDOVA API (`/api/v1/*`, same origin through the proxy) and unwraps the envelope.
 * Mutations send JSON (or multipart `FormData`, whose boundary the browser sets) together with a
 * trusted Origin (browser default).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return { data: undefined as T, pagination: null };

  const body = (await response.json().catch(() => null)) as {
    data: T;
    meta?: Meta;
    error: ApiError | null;
  } | null;
  if (!response.ok || !body || body.error) {
    throw new RedovaApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'An unexpected error occurred.',
      body?.meta?.requestId,
    );
  }
  return { data: body.data, pagination: body.meta?.pagination ?? null };
}
