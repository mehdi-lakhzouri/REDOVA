'use client';

import { RegistrationCard } from '@/components/auth/registration-card';
import type { SignUpHandler } from '@/components/auth/registration-schema';
import { routes } from '@/config/site';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';
import { rememberVerificationEmail } from '@/lib/auth/pending-verification';
import { clearPendingAvatar, savePendingAvatar } from '@/lib/avatar/pending-avatar-store';

/**
 * `POST /api/auth/sign-up/email`. The response is generic and carries no session, so the chosen
 * picture is parked locally and uploaded after the verification link signs the user in.
 */
const signUp: SignUpHandler = async ({ avatar, name, email, password }) => {
  if (avatar) await savePendingAvatar(email, avatar);
  else await clearPendingAvatar();

  const { error } = await authClient.signUp.email({
    name,
    email,
    password,
    callbackURL: routes.verifyEmail,
  });
  if (error) {
    await clearPendingAvatar();
    return { error: authErrorMessage(error, 'Unable to create your account. Please try again.') };
  }
  rememberVerificationEmail(email);
};

export function SignUpView() {
  return <RegistrationCard onSignUp={signUp} />;
}
