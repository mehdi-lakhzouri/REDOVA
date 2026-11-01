import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emailJobSchema, type EmailJob, type EmailTemplate } from '@redova/contracts';
import Handlebars from 'handlebars';
import type { EmailMessage } from './email-sender';
import { EMAIL_BRAND, loadEmailImages } from './email-assets';

/** Templates live outside `src` so the same path works from `src` (tests) and `dist` (runtime). */
export const EMAIL_TEMPLATES_DIR = resolve(__dirname, '../../templates/email');

const MAX_USER_VALUE_LENGTH = 64;

const truncate = (value: unknown, length = MAX_USER_VALUE_LENGTH): string => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const formatDate = (value: unknown): string => {
  const date = new Date(
    typeof value === 'string' || typeof value === 'number' ? value : String(value),
  );
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
};

/** Subjects are single-line headers: CR/LF are removed to prevent header injection (README §16.2). */
export const sanitizeSubject = (subject: string): string => subject.replace(/[\r\n]+/g, ' ').trim();

const createInstance = (escape: boolean) => {
  const hbs = Handlebars.create();
  hbs.registerHelper('truncate', (value: unknown) => truncate(value));
  hbs.registerHelper('formatDate', formatDate);
  const partialsDir = join(EMAIL_TEMPLATES_DIR, 'partials');
  const layoutsDir = join(EMAIL_TEMPLATES_DIR, 'layouts');
  const suffix = escape ? '.html.hbs' : '.text.hbs';
  for (const dir of [partialsDir, layoutsDir]) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(suffix))) {
      hbs.registerPartial(file.slice(0, -suffix.length), readFileSync(join(dir, file), 'utf8'));
    }
  }
  return hbs;
};

type Compiled = {
  subject: HandlebarsTemplateDelegate;
  html: HandlebarsTemplateDelegate;
  text: HandlebarsTemplateDelegate;
};

/**
 * Renders HTML, plain text and subject for an email job. Templates are precompiled once.
 * HTML uses escaped `{{ }}` interpolation only; raw `{{{ }}}` is forbidden (checked by a test).
 */
export class EmailRenderer {
  private readonly templates = new Map<EmailTemplate, Compiled>();
  private readonly images = loadEmailImages();

  constructor() {
    const html = createInstance(true);
    const plain = createInstance(false);
    for (const template of readdirSync(EMAIL_TEMPLATES_DIR).filter(
      (name) => !['layouts', 'partials'].includes(name),
    )) {
      const dir = join(EMAIL_TEMPLATES_DIR, template);
      const read = (file: string) => readFileSync(join(dir, file), 'utf8');
      this.templates.set(template as EmailTemplate, {
        subject: plain.compile(read('subject.hbs'), { noEscape: true }),
        html: html.compile(read('body.html.hbs')),
        text: plain.compile(read('body.text.hbs'), { noEscape: true }),
      });
    }
  }

  get availableTemplates(): EmailTemplate[] {
    return [...this.templates.keys()];
  }

  render(job: EmailJob): EmailMessage {
    const compiled = this.templates.get(job.template);
    if (!compiled) throw new Error(`Unknown email template: ${job.template}`);
    const { variables } = emailJobSchema.parse(job);
    for (const [key, value] of Object.entries(variables)) {
      if (!key.endsWith('Url') || typeof value !== 'string') continue;
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Email action URLs must use HTTP or HTTPS without embedded credentials');
    }
    const context = { ...variables, ...EMAIL_BRAND };
    return {
      to: job.to,
      subject: sanitizeSubject(compiled.subject(context)),
      html: compiled.html(context),
      text: compiled.text(context),
      attachments: this.images.map((image) => ({ ...image })),
    };
  }
}
