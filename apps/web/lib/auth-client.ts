import { adminClient, organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client for the REDOVA server. Requests go to `/api/auth/*` on the web origin and are
 * proxied to the API (next.config.ts), so session cookies stay first-party and the server's
 * Origin check sees `WEB_ORIGIN`.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient(), twoFactorClient(), adminClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
