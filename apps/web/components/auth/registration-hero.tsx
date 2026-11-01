import Link from 'next/link';
import { ChartNoAxesColumnIncreasing, Quote, ShieldCheck, Waypoints } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { routes } from '@/config/site';
import { AuthReveal } from './auth-reveal';
import { HeroFeatureList, type HeroFeature } from './hero-feature-list';
import styles from './registration.module.css';

const features: HeroFeature[] = [
  {
    icon: ShieldCheck,
    title: 'Realistic Attack Simulations',
    description:
      'Test your AI agents against real-world vulnerabilities and adversarial scenarios.',
  },
  {
    icon: Waypoints,
    title: 'Comprehensive Security Coverage',
    description: 'Cover the entire OWASP ASI framework with automated, dynamic assessments.',
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    title: 'Stronger, Safer AI Systems',
    description: 'Turn findings into actionable insights and build more resilient agents.',
  },
];

export function RegistrationHero() {
  return (
    <section className={styles.hero} aria-labelledby="registration-hero-title">
      <Link href={routes.home} className={styles.brandLink} aria-label="REDOVA home">
        <BrandLogo className={styles.headerLogo} appearance="dark" decorative preload />
      </Link>
      <AuthReveal as="p" className={styles.eyebrow} delay={0.06} distance={5}>
        SECURE <span>•</span> TEST <span>•</span> EMPOWER AI
      </AuthReveal>
      <h1
        id="registration-hero-title"
        className={styles.heading}
        aria-label="Build secure AI agents with confidence."
      >
        <span className={styles.headingClip} aria-hidden>
          <AuthReveal as="span" delay={0.14} distance={24}>
            Build secure AI agents
          </AuthReveal>
        </span>
        <span className={styles.headingClip} aria-hidden>
          <AuthReveal as="span" delay={0.26} distance={24}>
            with <span className={styles.accent}>confidence.</span>
          </AuthReveal>
        </span>
      </h1>
      <AuthReveal as="p" className={styles.description} delay={0.38}>
        Discover, test, and strengthen your AI agents against real-world threats. REDOVA provides a
        comprehensive platform to assess, simulate, and secure agentic AI systems at scale.
      </AuthReveal>
      <HeroFeatureList
        items={features}
        className={styles.features}
        itemClassName={styles.feature}
        iconClassName={styles.featureIcon}
        delay={0.48}
      />
      <div className={styles.quote} aria-hidden>
        <Quote />
        <p>
          SECURE AI AGENTS
          <br />
          FOR A MORE OPEN TOMORROW.
        </p>
        <span />
      </div>
    </section>
  );
}
