import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { EmailVerificationHero } from '@/components/auth/email-verification-hero';
import { EmailVerificationCard } from '@/components/auth/email-verification-card';
import { routes } from '@/config/site';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import styles from '@/components/auth/email-verification.module.css';
import { VerifyEmailView } from './_components/verify-email-view';

export const metadata = createAuthMetadata({
  title: 'Verify your email',
  description: 'Verify your email address to continue securely to your REDOVA account.',
  path: routes.verifyEmail,
});
export const viewport = authViewport;

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      hero={<EmailVerificationHero />}
      className={styles.layout}
      cardAreaClassName={styles.cardArea}
      sceneryClassName={styles.scenery}
      backgroundSrc="/images/auth/email-verification-background.webp"
      skipTarget="verification-title"
      skipLabel="Skip to email verification"
    >
      {/* The link outcome (`?error=`) is only known at request time. */}
      <Suspense fallback={<EmailVerificationCard />}>
        <VerifyEmailView />
      </Suspense>
    </AuthLayout>
  );
}
