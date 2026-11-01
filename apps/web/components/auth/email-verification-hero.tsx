import Link from 'next/link';
import { BrandLogo } from '@/components/brand/brand-logo';
import { routes } from '@/config/site';
import { AuthReveal } from './auth-reveal';
import styles from './email-verification.module.css';

export function EmailVerificationHero() {
  return (
    <header className={styles.hero}>
      <Link href={routes.home} className={styles.brandLink} aria-label="REDOVA home">
        <BrandLogo appearance="dark" className={styles.headerLogo} decorative preload />
      </Link>
      <AuthReveal as="p" className={styles.eyebrow} delay={0.08} distance={5}>
        SECURE <span>•</span> TEST <span>•</span> EMPOWER AI
      </AuthReveal>
    </header>
  );
}
