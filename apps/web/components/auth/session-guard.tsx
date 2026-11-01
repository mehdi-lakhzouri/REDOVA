'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { routes } from '@/config/site';
import { useSession } from '@/lib/auth-client';
import { withNext } from '@/lib/auth/redirects';

/** Renders children only for a live session; a stale or revoked cookie goes back to sign-in. */
export function SessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace(withNext(routes.signIn, pathname));
    else if (session && !session.user.emailVerified) router.replace(routes.verifyEmail);
  }, [isPending, session, pathname, router]);

  if (!session || !session.user.emailVerified) {
    return (
      <div className="grid min-h-svh place-items-center" role="status" aria-live="polite">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading your workspace…</span>
      </div>
    );
  }
  return children;
}
