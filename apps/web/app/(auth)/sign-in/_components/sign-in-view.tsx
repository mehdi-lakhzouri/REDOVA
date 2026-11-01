'use client';

import { useRouter } from 'next/navigation';
import { LoginCard } from '@/components/auth/login-card';
import type { SignInHandler } from '@/components/auth/login-form';
import { routes } from '@/config/site';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';
import { currentNextParam, safeRedirectPath, withNext } from '@/lib/auth/redirects';

/** `POST /api/auth/sign-in/email`, then either the TOTP challenge or the requested page. */
export function SignInView() {
  const router = useRouter();

  const signIn: SignInHandler = async ({ email, password, rememberMe }) => {
    const { data, error } = await authClient.signIn.email({ email, password, rememberMe });
    if (error) return { error: authErrorMessage(error, 'Unable to sign in. Please try again.') };

    const next = safeRedirectPath(currentNextParam());
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      router.push(withNext(routes.twoFactor, next));
      return;
    }
    router.replace(next);
  };

  return <LoginCard onSignIn={signIn} />;
}
