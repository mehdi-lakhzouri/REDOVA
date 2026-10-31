import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { isPaginated, type SuccessEnvelope } from '@redova/contracts';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { getRequestContext } from './request-context';

/** Wraps REDOVA controller results in `{ data, meta, error: null }` (README §18.2). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessEnvelope<unknown> | undefined> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (response.statusCode === 204) return undefined;
        const requestId = getRequestContext()?.requestId ?? '';
        if (isPaginated(body)) {
          return {
            data: body.items,
            meta: { requestId, pagination: body.pagination },
            error: null,
          };
        }
        return { data: body ?? null, meta: { requestId }, error: null };
      }),
    );
  }
}
