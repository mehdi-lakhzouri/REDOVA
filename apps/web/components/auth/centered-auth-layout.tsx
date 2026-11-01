import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { routes } from '@/config/site';
import { AuthLayout } from './auth-layout';
import styles from './centered-auth.module.css';

type CenteredAuthLayoutProps = {
  children: ReactNode;
  backgroundSrc: string;
  skipTarget: string;
  skipLabel: string;
};

/** Shares the auth scenery, dark palette and accessible entrance fallbacks. */
export function CenteredAuthLayout({
  children,
  backgroundSrc,
  skipTarget,
  skipLabel,
}: CenteredAuthLayoutProps) {
  return (
    <AuthLayout
      className={styles.layout}
      cardAreaClassName={styles.cardArea}
      sceneryClassName={styles.scenery}
      backgroundSrc={backgroundSrc}
      skipTarget={skipTarget}
      skipLabel={skipLabel}
      hero={
        <header className={styles.header}>
          <Link href={routes.home} aria-label="REDOVA home" className={styles.brandLink}>
            <BrandLogo appearance="dark" className={styles.headerLogo} decorative preload />
          </Link>
        </header>
      }
    >
      {children}
    </AuthLayout>
  );
}
