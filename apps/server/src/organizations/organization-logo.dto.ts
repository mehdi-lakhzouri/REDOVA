import { createZodDto } from 'nestjs-zod';
import { errorEnvelope, successEnvelope } from '@redova/contracts';
import { z } from 'zod';

export class OrganizationLogoEnvelopeDto extends createZodDto(
  successEnvelope(z.object({ logo: z.url() })),
) {}
export class OrganizationLogoErrorDto extends createZodDto(errorEnvelope) {}
