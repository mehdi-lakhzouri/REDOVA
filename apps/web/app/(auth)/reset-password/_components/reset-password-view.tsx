'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ResetPasswordCard } from '@/components/auth/reset-password-card';
import type { ResetPasswordHandler } from '@/components/auth/reset-password-form';
import { routes } from '@/config/site';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';

const LINK_INVALID = 'This reset link is invalid or has expired. Request a new one.';

/**
 * `POST /api/auth/reset-password { newPassword, token }`. The token is read once and removed from
 * the address bar so it does not linger in history; every session is revoked by the server.
 */
export function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const linkError = params.get('error') || !token ? LINK_INVALID : undefined;

  useEffect(() => {
    if (token) window.history.replaceState(null, '', routes.resetPassword);
  }, [token]);

  const resetPassword: ResetPasswordHandler = async (newPassword) => {
    if (!token) return { error: LINK_INVALID };
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error) {
      return {
        error: authErrorMessage(error, 'Unable to update your password. Please try again.'),
      };
    }
    toast.success('Password updated', { description: 'Sign in with your new password.' });
    router.replace(routes.signIn);
  };

  return <ResetPasswordCard onResetPassword={resetPassword} linkError={linkError} />;
}
