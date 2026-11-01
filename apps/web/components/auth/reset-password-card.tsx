import Link from 'next/link';
import { ArrowLeft, LockKeyhole, TriangleAlert } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { routes } from '@/config/site';
import { AuthReveal } from './auth-reveal';
import { ResetPasswordForm, type ResetPasswordHandler } from './reset-password-form';
import styles from './reset-password.module.css';

type ResetPasswordCardProps = {
  onResetPassword?: ResetPasswordHandler;
  /** Set when the emailed link is missing, invalid or expired: the form is replaced by a retry. */
  linkError?: string;
};

export function ResetPasswordCard({ onResetPassword, linkError }: ResetPasswordCardProps) {
  return (
    <AuthReveal className={styles.cardFrame} axis="x" distance={-26} delay={0.12}>
      <Card className={styles.card} role="region" aria-labelledby="reset-title">
        <div className={styles.cardBrand}>
          <BrandLogo className={styles.cardLogo} preload />
        </div>
        <AuthReveal className={styles.lockBadge} delay={0.24} distance={8}>
          <LockKeyhole aria-hidden strokeWidth={2.2} />
        </AuthReveal>
        <header className={styles.cardHeader}>
          <h2 id="reset-title">Reset your password</h2>
          <p>
            Choose a new password for your REDOVA account.
            <br className={styles.desktopBreak} /> Make sure it’s strong and unique to keep your
            account secure.
          </p>
        </header>
        {linkError ? (
          <div className={styles.linkError} role="alert">
            <p>
              <TriangleAlert aria-hidden />
              {linkError}
            </p>
            <Button render={<Link href={routes.forgotPassword} />} className={styles.updateButton}>
              Request a new link
            </Button>
          </div>
        ) : (
          <ResetPasswordForm onResetPassword={onResetPassword} />
        )}
        <div className={styles.divider} aria-hidden>
          <span />
          OR
          <span />
        </div>
        <Link href={routes.signIn} className={styles.backLink}>
          <ArrowLeft aria-hidden />
          Back to sign in
        </Link>
      </Card>
    </AuthReveal>
  );
}
