import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevEnqueueEmail } from './dev-enqueue-email';

describe('temporary email delivery logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['development', 'production'])(
    'omits recipients and action tokens in %s',
    async (env) => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await createDevEnqueueEmail(env)({
        to: 'private@example.com',
        template: 'verify-email',
        dedupeKey: 'https://example.com/verify?token=private-token',
        variables: {
          name: 'Private Person',
          verifyUrl: 'https://example.com/verify?token=private-token',
          expiresInHours: 1,
        },
      });
      expect(warn).toHaveBeenCalledWith({ template: 'verify-email' }, expect.any(String));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(
        /private@example.com|private-token|Private Person/,
      );
    },
  );
});
