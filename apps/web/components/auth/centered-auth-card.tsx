import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Card } from '@/components/ui/card';
import { routes } from '@/config/site';
import { AuthReveal } from './auth-reveal';
import styles from './forgot-password.module.css';

type CenteredAuthCardProps = {
  titleId: string;
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

/** Card frame shared by the single-purpose auth steps (recovery, verification, second factor). */
export function CenteredAuthCard({
  titleId,
  title,
  description,
  icon: Icon,
  children,
  backHref = routes.signIn,
  backLabel = 'Back to sign in',
}: CenteredAuthCardProps) {
  return (
    <AuthReveal className={styles.cardFrame} distance={18} delay={0.08}>
      <Card className={styles.card} role="region" aria-labelledby={titleId}>
        <div className={styles.cardBrand}>
          <BrandLogo appearance="dark" className={styles.cardLogo} preload />
        </div>
        <AuthReveal className={styles.mailBadge} delay={0.2} distance={8}>
          <Icon aria-hidden strokeWidth={1.8} />
        </AuthReveal>
        <header className={styles.cardHeader}>
          <AuthReveal delay={0.24} distance={8}>
            <h1 id={titleId}>{title}</h1>
          </AuthReveal>
          <AuthReveal as="p" delay={0.3} distance={6}>
            {description}
          </AuthReveal>
        </header>
        {children}
        <div className={styles.divider} aria-hidden>
          <span />
          OR
          <span />
        </div>
        <Link href={backHref} className={styles.backLink}>
          <ArrowLeft aria-hidden />
          {backLabel}
        </Link>
      </Card>
    </AuthReveal>
  );
}
