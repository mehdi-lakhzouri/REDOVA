import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { ResetPasswordHero } from '@/components/auth/reset-password-hero';
import { routes } from '@/config/site';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import styles from '@/components/auth/reset-password.module.css';
import { ResetPasswordCard } from '@/components/auth/reset-password-card';
import { ResetPasswordView } from './_components/reset-password-view';

export const metadata = createAuthMetadata({
  title: 'Reset your password',
  description:
    'Choose a new password to regain secure access to your REDOVA account and AI agent security workspace.',
  path: routes.resetPassword,
});
export const viewport = authViewport;

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      className={styles.layout}
      cardAreaClassName={styles.cardArea}
      sceneryClassName={styles.scenery}
      backgroundSrc="/images/auth/reset-security-background.webp"
      hero={<ResetPasswordHero />}
      skipTarget="reset-password"
      skipLabel="Skip to reset password"
    >
      {/* The token lives in the query string, which is only known at request time. */}
      <Suspense fallback={<ResetPasswordCard />}>
        <ResetPasswordView />
      </Suspense>
    </AuthLayout>
  );
}
