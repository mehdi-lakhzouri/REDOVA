import type { E2eContext } from '../global-setup';

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

/**
 * An API client with its own cookie jar, like one browser profile. Mutations carry the trusted
 * Origin, as the web client will.
 */
export class ApiClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly ctx: E2eContext) {}

  /** Session token value of this jar (for the log scan), if signed in. */
  get sessionToken(): string | undefined {
    const entry = [...this.cookies.entries()].find(([name]) => name.endsWith('session_token'));
    return entry ? decodeURIComponent(entry[1]).split('.')[0] : undefined;
  }

  async send(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      cookie: [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    };
    if (method !== 'GET') headers.origin = this.ctx.webOrigin;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(new URL(path, this.ctx.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const name = pair.slice(0, pair.indexOf('='));
      const value = pair.slice(pair.indexOf('=') + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body (e.g. a redirect): keep the text.
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get = (path: string) => this.send('GET', path);
  post = (path: string, body: unknown = {}) => this.send('POST', path, body);
  put = (path: string, body: unknown) => this.send('PUT', path, body);
  delete = (path: string) => this.send('DELETE', path);
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
}

/** Polls Mailpit until a message to `address` whose subject contains `subject` arrives. */
export const waitForEmail = async (
  ctx: E2eContext,
  address: string,
  subject: string,
): Promise<MailpitMessage> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${ctx.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
    const match = messages.find((message) => message.Subject.includes(subject));
    if (match) {
      return (await (
        await fetch(`${ctx.mailpitUrl}/api/v1/message/${match.ID}`)
      ).json()) as MailpitMessage;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`No "${subject}" email to ${address} within 20 s`);
};

/** First URL in a plain-text email that starts with `prefix`. */
export const extractLink = (text: string, prefix: string): string => {
  const match = text.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S+`));
  if (!match) throw new Error(`No link starting with ${prefix}`);
  return match[0];
};

export const pathOf = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};
