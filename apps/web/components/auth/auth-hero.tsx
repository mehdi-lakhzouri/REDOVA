import Link from 'next/link';
import { BrandLogo } from '@/components/brand/brand-logo';
import { HeroFeatureList } from './hero-feature-list';
import { AuthReveal } from './auth-reveal';
import { TypewriterHeading } from './typewriter-heading';
import { authMotion } from './auth-motion';
import styles from './auth.module.css';

export function AuthHero() {
  return (
    <section className={styles.hero} aria-labelledby="auth-hero-title">
      <Link href="/" aria-label="REDOVA home" className={styles.brandLink}>
        <BrandLogo appearance="dark" className={styles.headerLogo} decorative preload />
      </Link>
      <div className={styles.heroCopy}>
        <AuthReveal as="p" className={styles.eyebrow} delay={authMotion.eyebrow} distance={6}>
          SECURE <span>•</span> TEST <span>•</span> EMPOWER AI
        </AuthReveal>
        <TypewriterHeading id="auth-hero-title" lines={['Secure AI Agents.', 'Confidently.']} />
        <AuthReveal as="p" className={styles.heroDescription} delay={authMotion.description}>
          Continuously test, validate, and strengthen your
          <br className={styles.desktopBreak} /> AI agents against real-world threats.
        </AuthReveal>
        <HeroFeatureList />
      </div>
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={`${styles.annotation} ${styles.assessment}`} aria-hidden="true">
        AI SECURITY
        <br />
        ASSESSMENT
        <i />
      </div>
      <div className={`${styles.annotation} ${styles.resilience}`} aria-hidden="true">
        AGENT
        <br />
        RESILIENCE
        <i />
      </div>
      <div className={`${styles.annotation} ${styles.simulation}`} aria-hidden="true">
        REAL-WORLD
        <br />
        SIMULATION
        <i />
      </div>
      <div className={styles.particles} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </section>
  );
}
