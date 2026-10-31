import { Controller, Get, Query } from '@nestjs/common';
import { limitSchema, type Paginated } from '@redova/contracts';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

class ProbeQuery extends createZodDto(z.object({ limit: limitSchema })) {}

/** Test-only routes used by the foundation integration tests; never registered by the application. */
@Controller('__test')
export class ProbeController {
  @Get('validate')
  @AllowAnonymous()
  validate(@Query() query: ProbeQuery) {
    return { limit: query.limit };
  }

  @Get('boom')
  @AllowAnonymous()
  boom(): never {
    throw new Error('db password=secret');
  }

  @Get('protected')
  protected() {
    return { ok: true };
  }

  @Get('paginated')
  @AllowAnonymous()
  paginated(): Paginated<{ id: string }> {
    return { items: [{ id: 'a' }], pagination: { limit: 20, nextCursor: null, hasMore: false } };
  }
}
