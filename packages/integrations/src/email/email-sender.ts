import { createTransport, type Transporter } from 'nodemailer';

export interface EmailInlineImage {
  filename: string;
  content: Buffer;
  contentType: 'image/png' | 'image/jpeg';
  contentDisposition: 'inline';
  cid: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailInlineImage[];
}

/** Port for transactional email delivery (README §3.4 — the only port in Sprint 01). */
export interface EmailSender {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface EmailTransportConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  EMAIL_TRANSPORT: 'smtp' | 'api';
  EMAIL_FROM: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_API_KEY?: string;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

/** SMTP adapter: Gmail App Password in development, Mailpit in test/CI (README §16.3). */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(private readonly config: EmailTransportConfig) {
    this.transporter = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE ?? false,
      requireTLS: !config.SMTP_SECURE && config.SMTP_PORT === 587,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } } : {}),
    });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({ from: this.config.EMAIL_FROM, ...message });
    return { messageId: info.messageId };
  }
}

/**
 * Selects the adapter for `EMAIL_TRANSPORT`. Fails fast on unsafe or incomplete configuration.
 * The production provider adapter depends on decision D-11 and is not available yet.
 */
export const createEmailSender = (config: EmailTransportConfig): EmailSender => {
  if (config.EMAIL_TRANSPORT === 'api') {
    if (!config.EMAIL_API_KEY)
      throw new EmailConfigurationError('EMAIL_TRANSPORT=api requires EMAIL_API_KEY');
    throw new EmailConfigurationError(
      'EMAIL_TRANSPORT=api has no provider adapter yet (decision D-11); use smtp',
    );
  }
  if (!config.SMTP_HOST || !config.SMTP_PORT) {
    throw new EmailConfigurationError('EMAIL_TRANSPORT=smtp requires SMTP_HOST and SMTP_PORT');
  }
  if (config.NODE_ENV === 'production' && config.SMTP_HOST.toLowerCase() === 'smtp.gmail.com') {
    throw new EmailConfigurationError(
      'Gmail SMTP is for development only; configure a transactional provider in production',
    );
  }
  return new SmtpEmailSender(config);
};
