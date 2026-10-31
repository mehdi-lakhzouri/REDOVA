interface LogRequest {
  method?: string;
  url?: string;
}

/** Queries and fragments can contain tokens; bodies and headers are deliberately omitted. */
export const requestPath = (url: string | undefined): string | undefined =>
  url?.split(/[?#]/, 1)[0].replace(/(\/api\/auth\/reset-password\/)[^/]+/g, '$1[Redacted]');

export const serializeRequest = (req: LogRequest) => ({
  method: req.method,
  url: requestPath(req.url),
});

export const serializeResponse = (res: { statusCode: number }) => ({ statusCode: res.statusCode });

/** Errors from HTTP clients/ORMs may contain payloads, credentials or headers in extra properties. */
export const serializeError = (error: unknown) => {
  if (error === null || typeof error !== 'object') return error;
  const value = error as { type?: string; name?: string; message?: string; stack?: string };
  return { type: value.type ?? value.name, message: value.message, stack: value.stack };
};
