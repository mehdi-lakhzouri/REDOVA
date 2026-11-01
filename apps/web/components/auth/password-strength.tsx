'use client';

import { motion, useReducedMotion } from 'motion/react';
import { estimatePasswordStrength } from './password-policy';
import styles from './reset-password.module.css';
import { cn } from '@/lib/utils';

export function PasswordStrength({
  password,
  className,
  labelId = 'password-strength-label',
}: {
  password: string;
  className?: string;
  labelId?: string;
}) {
  const reducedMotion = useReducedMotion();
  const { score, label } = estimatePasswordStrength(password);
  return (
    <div className={cn(styles.strength, className)}>
      <div
        role="meter"
        aria-label="Estimated password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label}
        className={styles.strengthBars}
      >
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={styles.strengthSegment}>
            <motion.span
              initial={false}
              animate={{ scaleX: score >= level ? 1 : 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.28,
                delay: reducedMotion ? 0 : level * 0.025,
              }}
            />
          </span>
        ))}
      </div>
      <span
        id={labelId}
        className={styles.strengthLabel}
        data-strong={score >= 3}
        aria-live="polite"
      >
        {password ? label : '12–128 characters'}
      </span>
    </div>
  );
}
