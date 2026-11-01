import type { ReactNode } from 'react';
import { PendingAvatarSync } from '@/components/auth/pending-avatar-sync';
import { SessionGuard } from '@/components/auth/session-guard';

/** Authenticated area: `proxy.ts` filters missing cookies, the guard validates the session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGuard>
      <PendingAvatarSync />
      {children}
    </SessionGuard>
  );
}
