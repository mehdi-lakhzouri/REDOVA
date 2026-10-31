import { describe, expect, it } from 'vitest';
import {
  createEmailSender,
  EmailConfigurationError,
  type EmailTransportConfig,
  SmtpEmailSender,
} from './email-sender';

const smtp: EmailTransportConfig = {
  NODE_ENV: 'development',
  EMAIL_TRANSPORT: 'smtp',
  EMAIL_FROM: 'REDOVA <no-reply@redova.local>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
};

describe('createEmailSender (UT-003-04, AC-003-16)', () => {
  it('builds the SMTP adapter', () => {
    expect(createEmailSender(smtp)).toBeInstanceOf(SmtpEmailSender);
  });

  it('allows Gmail SMTP in development', () => {
    expect(
      createEmailSender({ ...smtp, SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465 }),
    ).toBeInstanceOf(SmtpEmailSender);
  });

  it('refuses Gmail SMTP in production', () => {
    expect(() =>
      createEmailSender({
        ...smtp,
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
      }),
    ).toThrow(EmailConfigurationError);
  });

  it('refuses an incomplete SMTP configuration', () => {
    expect(() => createEmailSender({ ...smtp, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
  });

  it('refuses the API transport until a provider is chosen (D-11)', () => {
    expect(() => createEmailSender({ ...smtp, EMAIL_TRANSPORT: 'api' })).toThrow(/EMAIL_API_KEY/);
    expect(() =>
      createEmailSender({ ...smtp, EMAIL_TRANSPORT: 'api', EMAIL_API_KEY: 'k' }),
    ).toThrow(/D-11/);
  });
});
