import { createHash } from 'node:crypto';
import { type Dispatcher, getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';

const HIBP_ORIGIN = 'https://api.pwnedpasswords.com';

/**
 * Intercepts the Have I Been Pwned range API (the plugin only sends the first 5 SHA-1 hex characters).
 * `compromised` passwords are reported as breached; `unavailable: true` simulates an outage.
 */
export const mockHibp = (options: { compromised?: string[]; unavailable?: boolean }) => {
  const previous: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.enableNetConnect(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
  setGlobalDispatcher(agent);

  const breached = new Map<string, string>();
  for (const password of options.compromised ?? []) {
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    breached.set(hash.slice(0, 5), hash.slice(5));
  }

  agent
    .get(HIBP_ORIGIN)
    .intercept({ path: (path) => path.startsWith('/range/'), method: 'GET' })
    .reply((req) => {
      if (options.unavailable) return { statusCode: 503, data: 'Service Unavailable' };
      const prefix = req.path.split('/').pop() ?? '';
      const suffix = breached.get(prefix);
      const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:0'];
      if (suffix) lines.push(`${suffix}:42`);
      return { statusCode: 200, data: lines.join('\r\n') };
    })
    .persist();

  return { restore: () => setGlobalDispatcher(previous) };
};
