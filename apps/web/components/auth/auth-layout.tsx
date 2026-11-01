import Image from 'next/image';
import type { ReactNode } from 'react';
import styles from './auth.module.css';
import { cn } from '@/lib/utils';

type AuthLayoutProps = {
  hero: ReactNode;
  children: ReactNode;
  className?: string;
  cardAreaClassName?: string;
  sceneryClassName?: string;
  backgroundSrc?: string;
  skipTarget?: string;
  skipLabel?: string;
};

export function AuthLayout({
  hero,
  children,
  className,
  cardAreaClassName,
  sceneryClassName,
  backgroundSrc = '/images/auth/security-landscape-template.webp',
  skipTarget = 'login-email',
  skipLabel = 'Skip to sign in',
}: AuthLayoutProps) {
  return (
    <main className={cn('dark', styles.layout, className)}>
      <noscript>
        <style>
          {
            '[data-auth-reveal], [data-auth-letter] { opacity: 1 !important; transform: none !important; } [data-auth-cursor] { display: none !important; }'
          }
        </style>
      </noscript>
      <a className={styles.skipLink} href={`#${skipTarget}`}>
        {skipLabel}
      </a>
      <div className={cn(styles.scenery, sceneryClassName)} aria-hidden="true">
        <Image src={backgroundSrc} alt="" fill sizes="100vw" preload className={styles.landscape} />
      </div>
      {hero}
      <div className={cn(styles.cardArea, cardAreaClassName)}>{children}</div>
    </main>
  );
}
