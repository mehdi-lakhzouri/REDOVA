/** Minimal Mailpit API client for tests (README §16.3: test/CI SMTP sink). */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

export const clearMailpit = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
};

export const listMessagesTo = async (
  address: string,
): Promise<Array<{ ID: string; Subject: string }>> => {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  const body = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
  return body.messages;
};

/** Polls until `count` messages to `address` exist, then returns the newest one in full. */
export const waitForEmail = async (
  address: string,
  options: { count?: number; timeoutMs?: number } = {},
): Promise<MailpitMessage> => {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    const messages = await listMessagesTo(address);
    if (messages.length >= (options.count ?? 1)) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      return (await res.json()) as MailpitMessage;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`No email to ${address} within the timeout`);
};

/** Extracts the first URL starting with `prefix` from a plain-text email body. */
export const extractLink = (text: string, prefix: string): string => {
  const match = text.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\S+`));
  if (!match) throw new Error(`No link starting with ${prefix}`);
  return match[0];
};
