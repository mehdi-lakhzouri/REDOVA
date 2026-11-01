'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { AuthReveal } from './auth-reveal';
import { PasswordField } from './password-field';
import { PasswordStrength } from './password-strength';
import { PasswordRequirements } from './password-requirements';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './password-policy';
import styles from './reset-password.module.css';

const MotionButton = motion.create(Button);
const resetSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'Use at least 12 characters.')
      .max(PASSWORD_MAX_LENGTH, 'Use no more than 128 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Your passwords do not match.',
  });

export type ResetPasswordHandler = (newPassword: string) => Promise<{ error?: string } | void>;

export function ResetPasswordForm({ onResetPassword }: { onResetPassword?: ResetPasswordHandler }) {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });
  const disabled = !hydrated || isSubmitting;

  async function submit(values: z.infer<typeof resetSchema>) {
    setSubmissionError(null);
    if (!onResetPassword) {
      setSubmissionError('Password updates are not available yet. Please try again later.');
      return;
    }
    try {
      const result = await onResetPassword(values.password);
      if (result?.error) setSubmissionError(result.error);
    } catch {
      setSubmissionError('Unable to update your password. Please try again.');
    }
  }

  return (
    <form
      method="post"
      className={styles.form}
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Reset your password"
      aria-busy={isSubmitting}
    >
      <noscript>
        <p className={styles.fieldError}>Enable JavaScript to update your password securely.</p>
      </noscript>
      <AuthReveal delay={0.36} distance={10}>
        <PasswordField
          id="reset-password"
          className={styles.primaryField}
          label="New password"
          placeholder="Enter a new password"
          {...register('password')}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={disabled}
          error={errors.password?.message}
          aria-describedby="reset-password-guidance password-strength-label"
        />
        <PasswordStrength password={password} />
      </AuthReveal>
      <AuthReveal className={styles.confirmField} delay={0.46} distance={10}>
        <PasswordField
          id="reset-password-confirm"
          label="Confirm new password"
          placeholder="Confirm your new password"
          {...register('confirmPassword')}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={disabled}
          error={errors.confirmPassword?.message}
        />
      </AuthReveal>
      <AuthReveal delay={0.56} distance={8}>
        <PasswordRequirements password={password} />
      </AuthReveal>
      <p id="reset-password-guidance" className="sr-only">
        Use 12 to 128 characters. Character-mix suggestions are optional. Strength is an estimate;
        the server checks whether the password is acceptable.
      </p>
      {submissionError && (
        <p className={styles.submissionError} role="alert">
          {submissionError}
        </p>
      )}
      <AuthReveal delay={0.64} distance={6}>
        <MotionButton
          type="submit"
          className={styles.updateButton}
          disabled={disabled}
          initial={false}
          animate="rest"
          whileHover={reducedMotion ? undefined : 'hovered'}
          whileTap={reducedMotion ? undefined : { scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          <span className={styles.updateButtonLabel}>
            {isSubmitting ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <motion.span
                className={styles.refreshIcon}
                variants={{ rest: { rotate: 0 }, hovered: { rotate: reducedMotion ? 0 : 180 } }}
                transition={{ duration: reducedMotion ? 0 : 0.4 }}
              >
                <RefreshCw aria-hidden />
              </motion.span>
            )}
            {isSubmitting ? 'Updating password…' : 'Update password'}
          </span>
          <motion.span
            className={styles.updateArrow}
            aria-hidden
            variants={{ rest: { x: 0 }, hovered: { x: reducedMotion ? 0 : 4 } }}
          >
            <ArrowRight />
          </motion.span>
        </MotionButton>
      </AuthReveal>
    </form>
  );
}
