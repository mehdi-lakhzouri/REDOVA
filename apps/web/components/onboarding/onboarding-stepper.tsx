import { Check } from 'lucide-react';
import type { OnboardingStep } from '@/lib/onboarding/progress';
import styles from './onboarding.module.css';

export function OnboardingStepper({ step }: { step: OnboardingStep }) {
  const active = step === 'organization' ? 1 : 2;
  return (
    <nav aria-label="Workspace setup progress" className={styles.stepper}>
      <ol>
        {['Verify email', 'Create organization', 'Invite team (optional)'].map((label, index) => (
          <li
            key={label}
            aria-current={index === active ? 'step' : undefined}
            data-complete={index < active}
          >
            <span className={styles.stepCircle}>
              {index < active ? <Check aria-hidden /> : index + 1}
            </span>
            <span>{label}</span>
            {index < active && <span className="sr-only"> — completed</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
