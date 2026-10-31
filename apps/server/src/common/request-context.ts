import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext | undefined => storage.getStore();

const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Runs every request (including the Better Auth handler) inside a context carrying the request id,
 * client IP and user agent, so audit events and logs can be correlated (README §17.3).
 */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId, ipAddress: req.ip, userAgent: req.get('user-agent') }, next);
};
