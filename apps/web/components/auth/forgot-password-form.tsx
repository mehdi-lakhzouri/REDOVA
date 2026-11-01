'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, CheckCircle2, LoaderCircle, Mail, Send } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { AuthReveal } from './auth-reveal';
import styles from './forgot-password.module.css';

const MotionButton = motion.create(Button);
const recoverySchema = z.object({
  email: z.string().trim().max(254, 'Enter a valid work email.').email('Enter a valid work email.'),
});

/** The adapter owns the API call and trusted reset URL; presentation only receives an email. */
export type RequestPasswordResetHandler = (email: string) => Promise<{ error?: string } | void>;

export function ForgotPasswordForm({
  onRequestReset,
}: {
  onRequestReset?: RequestPasswordResetHandler;
}) {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof recoverySchema>>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: '' },
  });
  const disabled = !hydrated || isSubmitting;

  async function submit({ email }: z.infer<typeof recoverySchema>) {
    setSubmissionError(null);
    if (!onRequestReset) {
      setSubmissionError('Password recovery is not available yet. Please try again later.');
      return;
    }
    try {
      const result = await onRequestReset(email);
      if (result?.error) {
        setSubmissionError(result.error);
        return;
      }
      // Never disclose account existence or retain the submitted address in the confirmation.
      reset({ email: '' });
      setSent(true);
    } catch {
      setSubmissionError('Unable to request a reset link. Please try again.');
    }
  }

  if (sent) {
    return (
      <div id="recovery-email" tabIndex={-1} className={styles.confirmation} role="status">
        <CheckCircle2 aria-hidden />
        <h2>Check your inbox</h2>
        <p>
          If an account exists for this email, you’ll receive a password reset link shortly. Check
          your spam folder too.
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      className={styles.form}
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Request a password reset link"
      aria-busy={isSubmitting}
    >
      <noscript>
        <p className={styles.fieldError}>Enable JavaScript to request a reset link securely.</p>
      </noscript>
      <AuthReveal delay={0.38} distance={8}>
        <Label htmlFor="recovery-email" className={styles.label}>
          Work email
        </Label>
        <div className={styles.inputWrap}>
          <Mail className={styles.fieldIcon} aria-hidden />
          <Input
            id="recovery-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="you@company.com"
            className={styles.input}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'recovery-email-error' : undefined}
            disabled={disabled}
            required
            {...register('email')}
          />
        </div>
        {errors.email && (
          <p id="recovery-email-error" className={styles.fieldError} role="alert">
            {errors.email.message}
          </p>
        )}
      </AuthReveal>
      {submissionError && (
        <p className={styles.submissionError} role="alert">
          {submissionError}
        </p>
      )}
      <AuthReveal delay={0.48} distance={6}>
        <MotionButton
          type="submit"
          className={styles.sendButton}
          disabled={disabled}
          initial={false}
          animate="rest"
          whileHover={reducedMotion ? undefined : 'hovered'}
          whileTap={reducedMotion ? undefined : { scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          <span className={styles.buttonLabel}>
            {isSubmitting ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <motion.span
                className={styles.sendIcon}
                variants={{
                  rest: { x: 0, y: 0 },
                  hovered: { x: reducedMotion ? 0 : 3, y: reducedMotion ? 0 : -3 },
                }}
              >
                <Send aria-hidden />
              </motion.span>
            )}
            {isSubmitting ? 'Sending reset link…' : 'Send reset link'}
          </span>
          <motion.span
            className={styles.buttonArrow}
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
