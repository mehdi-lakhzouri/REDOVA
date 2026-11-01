import { Info, Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AuthReveal } from './auth-reveal';
import { EmailVerificationBadge } from './email-verification-badge';
import {
  EmailVerificationActions,
  type ResendVerificationHandler,
} from './email-verification-actions';
import styles from './email-verification.module.css';

export type EmailVerificationCardProps = {
  /** Display-only address from a trusted registration/session context, never a query parameter. */
  email?: string;
  verificationRequested?: boolean;
  onResend?: ResendVerificationHandler;
};

export function EmailVerificationCard({
  email,
  verificationRequested = false,
  onResend,
}: EmailVerificationCardProps) {
  return (
    <AuthReveal className={styles.cardFrame} axis="x" distance={-20} delay={0.1}>
      <Card className={styles.card} role="region" aria-labelledby="verification-title">
        <AuthReveal className={styles.badgeArea} delay={0.2} distance={12}>
          <EmailVerificationBadge />
        </AuthReveal>
        <AuthReveal className={styles.headingArea} delay={0.28} distance={8}>
          <h1 id="verification-title" tabIndex={-1}>
            Verify your <span>email</span>
          </h1>
        </AuthReveal>
        <AuthReveal as="p" className={styles.lead} delay={0.34} distance={6}>
          {verificationRequested && email
            ? 'We’ve sent a verification link to'
            : 'Check your inbox for a verification link'}
        </AuthReveal>
        <AuthReveal className={styles.emailPill} delay={0.4} distance={6}>
          <Mail aria-hidden />
          <span className={styles.emailAddress}>{email || 'Your account email'}</span>
        </AuthReveal>
        <AuthReveal as="p" className={styles.description} delay={0.46} distance={6}>
          Please check your inbox and click the link to verify your account. You’ll be automatically
          signed in and redirected to continue.
        </AuthReveal>
        <AuthReveal delay={0.52} distance={6}>
          <EmailVerificationActions onResend={onResend} />
        </AuthReveal>
        <aside className={styles.notice} aria-label="Email verification required">
          <Info aria-hidden />
          <p>Until your email is verified, you can’t sign in or create an organization.</p>
        </aside>
      </Card>
    </AuthReveal>
  );
}
