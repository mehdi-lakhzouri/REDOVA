import Link from 'next/link';
import type { ReactNode } from 'react';
import { Layers, ShieldCheck, Zap } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { AuthReveal } from '@/components/auth/auth-reveal';
import { BrandLogo } from '@/components/brand/brand-logo';
import { routes } from '@/config/site';
import type { OnboardingStep } from '@/lib/onboarding/progress';
import styles from './onboarding.module.css';

export function OnboardingLayout({
  step,
  children,
}: {
  step: OnboardingStep;
  children: ReactNode;
}) {
  const invitations = step === 'invitations';
  return (
    <AuthLayout
      className={`${styles.layout} ${invitations ? styles.invitationLayout : ''}`}
      cardAreaClassName={styles.cardArea}
      sceneryClassName={styles.scenery}
      backgroundSrc={`/images/onboarding/${invitations ? 'invitations' : 'organization'}.webp`}
      skipTarget="onboarding-title"
      skipLabel="Skip to workspace setup"
      hero={
        <aside className={styles.hero}>
          <Link href={routes.dashboard} className={styles.brandLink} aria-label="REDOVA workspace">
            <BrandLogo appearance="dark" className={styles.headerLogo} decorative preload />
          </Link>
          <p className={styles.tagline}>
            SECURE <span>•</span> TEST <span>•</span> EMPOWER AI
          </p>
          <AuthReveal delay={0.08} distance={12}>
            <h2 className={styles.heroHeading}>
              Set up your <span>workspace</span>
            </h2>
          </AuthReveal>
          <AuthReveal as="p" className={styles.heroDescription} delay={0.18}>
            Create your organization and invite your team to start testing and securing your AI
            agents{invitations ? ' together.' : '.'}
          </AuthReveal>
          {invitations && (
            <ul className={styles.benefits}>
              {[
                [ShieldCheck, 'Centralize your team'],
                [Layers, 'Manage access and roles'],
                [Zap, 'Start testing in minutes'],
              ].map(([Icon, label]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <li key={String(label)}>
                    <FeatureIcon aria-hidden />
                    {String(label)}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      }
    >
      {children}
    </AuthLayout>
  );
}
