import { ChartNoAxesColumnIncreasing, ShieldCheck, Waypoints } from 'lucide-react';
import styles from './auth.module.css';
import { AuthReveal } from './auth-reveal';
import { authMotion } from './auth-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HeroFeature = { icon: LucideIcon; title: string; description: string };

const features = [
  {
    icon: ShieldCheck,
    title: 'Identify Vulnerabilities',
    description: 'Find and fix risks across your agentic AI systems.',
  },
  {
    icon: Waypoints,
    title: 'Test in Realistic Environments',
    description: 'Use purpose-built simulations and benchmarks.',
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    title: 'Build More Resilient Agents',
    description: 'Turn insights into stronger, safer AI products.',
  },
];

export function HeroFeatureList({
  items = features,
  className,
  itemClassName,
  iconClassName,
  delay = authMotion.features.delay,
}: {
  items?: HeroFeature[];
  className?: string;
  itemClassName?: string;
  iconClassName?: string;
  delay?: number;
}) {
  return (
    <ul className={cn(styles.features, className)}>
      {items.map(({ icon: Icon, title, description }, index) => (
        <AuthReveal
          as="li"
          key={title}
          className={cn(styles.feature, itemClassName)}
          axis="x"
          distance={14}
          delay={delay + index * authMotion.features.stagger}
        >
          <span className={cn(styles.featureIcon, iconClassName)}>
            <Icon aria-hidden="true" strokeWidth={1.8} />
          </span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </AuthReveal>
      ))}
    </ul>
  );
}
