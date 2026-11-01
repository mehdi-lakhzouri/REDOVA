'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { ResendVerificationHandler } from '@/components/auth/email-verification-actions';
import { EmailVerificationCard } from '@/components/auth/email-verification-card';
import { routes } from '@/config/site';
import { authClient, useSession } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';
import { forgetVerificationEmail, readVerificationEmail } from '@/lib/auth/pending-verification';
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/auth/redirects';

const subscribe = () => () => {};
const NO_EMAIL = 'Sign in with your email and password to receive a new verification link.';

/**
 * Landing page of the emailed link: Better Auth redirects here with a session on success
 * (`autoSignInAfterVerification`) or with `?error=<code>` on failure. Right after sign-up it
 * shows the address remembered for this tab and can resend the link.
 */
export function VerifyEmailView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  // Tab storage is browser-only: render the generic copy on the server, the address after hydration.
  const email = useSyncExternalStore(subscribe, readVerificationEmail, () => null);
  const errorCode = params.get('error');
  const verified = !errorCode && session?.user.emailVerified === true;

  useEffect(() => {
    if (!errorCode) return;
    toast.error('Verification link problem', {
      id: 'verify-email-link',
      description: authErrorMessage(
        { code: errorCode },
        'This verification link is invalid. Request a new one.',
      ),
    });
  }, [errorCode]);

  useEffect(() => {
    if (!verified) return;
    forgetVerificationEmail();
    toast.success('Email verified', { id: 'verify-email-link' });
    router.replace(DEFAULT_AUTHENTICATED_ROUTE);
  }, [verified, router]);

  const resend: ResendVerificationHandler = async () => {
    if (!email) return { error: NO_EMAIL };
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: routes.verifyEmail,
    });
    if (error) {
      return { error: authErrorMessage(error, 'Unable to send a verification link. Try again.') };
    }
  };

  return (
    <EmailVerificationCard
      email={email ?? undefined}
      verificationRequested={Boolean(email)}
      onResend={resend}
    />
  );
}
