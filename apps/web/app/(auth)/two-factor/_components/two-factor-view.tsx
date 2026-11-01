'use client';

import { useRouter } from 'next/navigation';
import { TwoFactorCard, type VerifySecondFactorHandler } from '@/components/auth/two-factor-card';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';
import { currentNextParam, safeRedirectPath } from '@/lib/auth/redirects';

/** `POST /api/auth/two-factor/verify-totp` or `/verify-backup-code` with the challenge cookie. */
export function TwoFactorView() {
  const router = useRouter();

  const verify: VerifySecondFactorHandler = async ({ method, code, trustDevice }) => {
    const { error } =
      method === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (error) return { error: authErrorMessage(error, 'Unable to verify your code. Try again.') };
    router.replace(safeRedirectPath(currentNextParam()));
  };

  return <TwoFactorCard onVerify={verify} />;
}
