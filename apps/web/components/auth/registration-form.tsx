'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CheckCircle2,
  CircleCheck,
  Info,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { routes } from '@/config/site';
import { AuthReveal } from './auth-reveal';
import { AuthTextField } from './auth-text-field';
import { AvatarPicker } from './avatar-picker';
import { PasswordField } from './password-field';
import { PasswordStrength } from './password-strength';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './password-policy';
import { RegistrationConsent, type RegistrationLegalProps } from './registration-consent';
import {
  registrationSchema,
  type RegistrationValues,
  type SignUpHandler,
} from './registration-schema';
import styles from './registration.module.css';

const MotionButton = motion.create(Button);

export function RegistrationForm({
  onSignUp,
  ...legal
}: RegistrationLegalProps & { onSignUp?: SignUpHandler }) {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      avatar: null,
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    },
  });
  const password = useWatch({ control, name: 'password' });
  const disabled = !hydrated || isSubmitting;
  const validLength =
    password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;

  async function submit(values: RegistrationValues) {
    setSubmissionError(null);
    if (!onSignUp) {
      setSubmissionError('Account registration is not available yet. Please try again later.');
      return;
    }
    try {
      const result = await onSignUp({
        avatar: values.avatar,
        name: values.name,
        email: values.email,
        password: values.password,
        acceptedTerms: true,
      });
      if (result?.error) {
        setSubmissionError(result.error);
        return;
      }
      reset();
      setSubmitted(true);
    } catch {
      setSubmissionError('Unable to create your account. Please try again.');
    }
  }

  if (submitted)
    return (
      <div className={styles.confirmation} role="status" id="registration-name" tabIndex={-1}>
        <CheckCircle2 aria-hidden />
        <h3>Check your inbox</h3>
        <p>
          If registration can be completed for this email, you’ll receive a verification link with
          the next steps.
        </p>
        <Link href={routes.verifyEmail} className={styles.verificationLink}>
          Continue to email verification
          <ArrowRight aria-hidden />
        </Link>
      </div>
    );

  return (
    <form
      method="post"
      className={styles.form}
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Create your REDOVA account"
      aria-busy={isSubmitting}
    >
      <noscript>
        <p className={styles.fieldError}>Enable JavaScript to create your account securely.</p>
      </noscript>
      <div className={styles.identityFields}>
        <AuthReveal delay={0.2} distance={8}>
          <Controller
            control={control}
            name="avatar"
            render={({ field, fieldState }) => (
              <AvatarPicker
                value={field.value}
                onChange={field.onChange}
                disabled={disabled}
                error={fieldState.error?.message}
              />
            )}
          />
        </AuthReveal>
        <AuthReveal delay={0.24} distance={8}>
          <AuthTextField
            id="registration-name"
            label="Full name"
            icon={UserRound}
            placeholder="John Doe"
            autoComplete="name"
            maxLength={200}
            disabled={disabled}
            error={errors.name?.message}
            {...register('name')}
          />
        </AuthReveal>
        <AuthReveal delay={0.32} distance={8}>
          <AuthTextField
            id="registration-email"
            label="Work email"
            icon={Mail}
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            disabled={disabled}
            error={errors.email?.message}
            {...register('email')}
          />
        </AuthReveal>
      </div>
      <AuthReveal className={styles.passwordGroup} delay={0.4} distance={8}>
        <PasswordField
          id="registration-password"
          className={styles.passwordField}
          label="Password"
          leadingIcon={LockKeyhole}
          placeholder="Create a secure password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={disabled}
          error={errors.password?.message}
          aria-describedby="registration-password-guidance registration-strength-label"
          {...register('password')}
        />
        <PasswordStrength
          password={password}
          className={styles.strength}
          labelId="registration-strength-label"
        />
        <p
          id="registration-password-guidance"
          className={styles.passwordHint}
          data-valid={validLength}
        >
          {validLength ? <CircleCheck aria-hidden /> : <Info aria-hidden />}
          <span>Use 12–128 characters. A mix of letters, numbers and symbols is optional.</span>
        </p>
      </AuthReveal>
      <AuthReveal className={styles.confirmGroup} delay={0.48} distance={8}>
        <PasswordField
          id="registration-confirm"
          className={styles.passwordField}
          label="Confirm password"
          leadingIcon={LockKeyhole}
          placeholder="Confirm your password"
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={disabled}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
      </AuthReveal>
      <AuthReveal delay={0.56} distance={6}>
        <RegistrationConsent
          {...legal}
          control={control}
          disabled={disabled}
          error={errors.acceptedTerms?.message}
        />
      </AuthReveal>
      {submissionError && (
        <p className={styles.submissionError} role="alert">
          {submissionError}
        </p>
      )}
      <AuthReveal delay={0.62} distance={6}>
        <MotionButton
          type="submit"
          className={styles.createButton}
          disabled={disabled}
          initial={false}
          animate="rest"
          whileHover={reducedMotion ? undefined : 'hovered'}
          whileTap={reducedMotion ? undefined : { scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden />}
          {isSubmitting ? 'Creating account…' : 'Create account'}
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
