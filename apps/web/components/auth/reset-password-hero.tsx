import Link from 'next/link';
import { ChartNoAxesColumnIncreasing, ShieldCheck, Waypoints } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { AuthReveal } from './auth-reveal';
import { HeroFeatureList, type HeroFeature } from './hero-feature-list';
import styles from './reset-password.module.css';

const features: HeroFeature[] = [
  {
    icon: ShieldCheck,
    title: 'Real-World Security',
    description: 'Identify and fix vulnerabilities before they reach production.',
  },
  {
    icon: Waypoints,
    title: 'Agentic AI Testing',
    description: 'Purpose-built for LLM and multi-agent systems.',
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    title: 'Actionable Insights',
    description: 'Turn findings into stronger, safer AI products.',
  },
];

export function ResetPasswordHero() {
  return (
    <section className={styles.hero} aria-labelledby="reset-hero-title">
      <Link href="/" aria-label="REDOVA home" className={styles.brandLink}>
        <BrandLogo className={styles.headerLogo} decorative preload />
      </Link>
      <AuthReveal as="p" className={styles.eyebrow} delay={0.08} distance={5}>
        SECURE <span>•</span> TEST <span>•</span> EMPOWER AI
      </AuthReveal>
      <h1
        id="reset-hero-title"
        className={styles.heading}
        aria-label="Safer AI Agents for a More Secure Tomorrow."
      >
        <span className={styles.headingClip} aria-hidden>
          <AuthReveal as="span" className={styles.headingLine} delay={0.16} distance={32}>
            Safer AI Agents
          </AuthReveal>
        </span>
        <span className={styles.headingClip} aria-hidden>
          <AuthReveal as="span" className={styles.headingLine} delay={0.28} distance={32}>
            for a <span>More Secure</span>
          </AuthReveal>
        </span>
        <span className={styles.headingClip} aria-hidden>
          <AuthReveal
            as="span"
            className={`${styles.headingLine} ${styles.accent}`}
            delay={0.4}
            distance={32}
          >
            Tomorrow.
          </AuthReveal>
        </span>
      </h1>
      <AuthReveal as="p" className={styles.description} delay={0.52}>
        Test, validate, and strengthen your AI agents against real-world threats.
      </AuthReveal>
      <HeroFeatureList
        items={features}
        className={styles.features}
        itemClassName={styles.feature}
        iconClassName={styles.featureIcon}
        delay={0.62}
      />
      <div className={styles.peopleTag} aria-hidden>
        <i />
        PEOPLE
        <br />
        SECURE
        <br />
        AI AGENTS
      </div>
    </section>
  );
}
