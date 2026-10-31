import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isAPIError } from '@redova/auth';
import {
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
  InvalidCursorError,
} from '@redova/contracts';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ApiException } from './api-exception';
import { getRequestContext } from './request-context';

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
}

const fromZodError = (error: ZodError): MappedError => ({
  status: 400,
  code: ErrorCode.VALIDATION_FAILED,
  message: ERROR_MESSAGES.VALIDATION_FAILED,
  details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});

const STATUS_FALLBACK: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN_PERMISSION,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

const fromCode = (code: ErrorCode): MappedError => ({
  status: ERROR_HTTP_STATUS[code],
  code,
  message: ERROR_MESSAGES[code],
});

/**
 * Renders every error of the REDOVA API in the `{ data: null, meta, error }` envelope (README §18.2).
 * Unknown errors are masked as INTERNAL_ERROR and logged with the request id.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = getRequestContext()?.requestId ?? '';
    const mapped = this.map(exception);

    if (mapped.status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    const body: ErrorEnvelope = {
      data: null,
      meta: { requestId },
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    };
    response.status(mapped.status).json(body);
  }

  private map(exception: unknown): MappedError {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) return fromZodError(zodError);
      return fromCode(ErrorCode.VALIDATION_FAILED);
    }
    if (exception instanceof ZodError) return fromZodError(exception);
    if (exception instanceof InvalidCursorError) return fromCode(ErrorCode.INVALID_CURSOR);
    if (exception instanceof ApiException) {
      return { status: exception.getStatus(), code: exception.code, message: exception.message };
    }
    if (isAPIError(exception)) {
      // Errors raised by server-side `auth.api.*` calls keep Better Auth's code (e.g. YOU_CANNOT_BAN_YOURSELF).
      const status = exception.statusCode;
      const body = exception.body as { code?: string; message?: string } | undefined;
      const fallback = STATUS_FALLBACK[status] ?? ErrorCode.INTERNAL_ERROR;
      return {
        status,
        code: body?.code ?? fallback,
        message:
          status >= 500
            ? ERROR_MESSAGES.INTERNAL_ERROR
            : (body?.message ?? ERROR_MESSAGES[fallback]),
      };
    }
    if (exception instanceof UnauthorizedException) return fromCode(ErrorCode.UNAUTHENTICATED);
    if (exception instanceof ForbiddenException) return fromCode(ErrorCode.FORBIDDEN_PERMISSION);
    if (exception instanceof NotFoundException) return fromCode(ErrorCode.NOT_FOUND);
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_FALLBACK[status] ?? ErrorCode.INTERNAL_ERROR;
      return { status: status >= 500 ? 500 : status, code, message: ERROR_MESSAGES[code] };
    }
    return fromCode(ErrorCode.INTERNAL_ERROR);
  }
}
