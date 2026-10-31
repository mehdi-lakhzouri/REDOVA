import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext | undefined => storage.getStore();

const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

/** Shared by the request context and Pino, including when the logger runs without that middleware. */
export const getOrCreateRequestId = (req: {
  id?: unknown;
  headers: IncomingHttpHeaders;
}): string => {
  if (typeof req.id === 'string' && SAFE_REQUEST_ID.test(req.id)) return req.id;
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
};

/**
 * Runs every request (including the Better Auth handler) inside a context carrying the request id,
 * client IP and user agent, so audit events and logs can be correlated (README §17.3).
 */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = getOrCreateRequestId(req);
  (req as Request & { id: string }).id = requestId;
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId, ipAddress: req.ip, userAgent: req.get('user-agent') }, next);
};
