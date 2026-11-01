'use client';

import { ForgotPasswordCard } from '@/components/auth/forgot-password-card';
import type { RequestPasswordResetHandler } from '@/components/auth/forgot-password-form';
import { routes } from '@/config/site';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';

/**
 * `POST /api/auth/request-password-reset`. The answer is identical whether or not the account
 * exists; the emailed link redirects to `redirectTo?token=…` (or `?error=INVALID_TOKEN`).
 */
const requestReset: RequestPasswordResetHandler = async (email) => {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: routes.resetPassword,
  });
  if (error) {
    return { error: authErrorMessage(error, 'Unable to request a reset link. Please try again.') };
  }
};

export function ForgotPasswordView() {
  return <ForgotPasswordCard onRequestReset={requestReset} />;
}
