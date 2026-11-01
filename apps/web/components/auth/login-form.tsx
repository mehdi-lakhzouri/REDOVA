'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import styles from './auth.module.css';
import { AuthReveal } from './auth-reveal';
import { authMotion } from './auth-motion';
import { useHydrated } from '@/hooks/use-hydrated';
import { routes } from '@/config/site';

const MotionButton = motion.create(Button);
const buttonStates = { rest: { scale: 1 }, hovered: { scale: 1.012 }, pressed: { scale: 0.975 } };

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid work email.'),
  // Authentication and password policy remain the responsibility of the future adapter/server.
  password: z.string().min(1, 'Enter your password.'),
  rememberMe: z.boolean(),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
export type SignInHandler = (credentials: LoginCredentials) => Promise<{ error?: string } | void>;

type LoginFormProps = {
  onSignIn?: SignInHandler;
  forgotPasswordHref?: string;
};

/** No credentials are persisted, logged or transmitted unless an authentication adapter is supplied. */
export function LoginForm({
  onSignIn,
  forgotPasswordHref = routes.forgotPassword,
}: LoginFormProps) {
  const reducedMotion = useReducedMotion();
  const [pressCount, setPressCount] = useState(0);
  const hydrated = useHydrated();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  async function submit(credentials: LoginCredentials) {
    setSubmissionError(null);
    if (!onSignIn) {
      setSubmissionError('Account sign-in is not available yet. Please try again later.');
      return;
    }
    try {
      const result = await onSignIn(credentials);
      if (result?.error) setSubmissionError(result.error);
    } catch {
      setSubmissionError('Unable to sign in. Please try again.');
    }
  }

  return (
    <form
      method="post"
      className={styles.form}
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-label="Sign in"
      aria-busy={isSubmitting}
    >
      <noscript>
        <p className={styles.fieldError}>Enable JavaScript to sign in securely.</p>
      </noscript>
      <AuthReveal className={styles.field} delay={authMotion.fields.delay} distance={8}>
        <Label htmlFor="login-email" className={styles.label}>
          Work email
        </Label>
        <div className={styles.inputWrap}>
          <Mail className={styles.fieldIcon} aria-hidden="true" />
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@company.com"
            className={styles.input}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            disabled={!hydrated || isSubmitting}
            required
            {...register('email')}
          />
        </div>
        {errors.email && (
          <p id="login-email-error" className={styles.fieldError} role="alert">
            {errors.email.message}
          </p>
        )}
      </AuthReveal>
      <AuthReveal
        className={styles.field}
        delay={authMotion.fields.delay + authMotion.fields.stagger}
        distance={8}
      >
        <Label htmlFor="login-password" className={styles.label}>
          Password
        </Label>
        <div className={styles.inputWrap}>
          <LockKeyhole className={styles.fieldIcon} aria-hidden="true" />
          <Input
            id="login-password"
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            className={`${styles.input} ${styles.passwordInput}`}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            disabled={!hydrated || isSubmitting}
            required
            {...register('password')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.passwordToggle}
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
            aria-controls="login-password"
            disabled={!hydrated || isSubmitting}
          >
            {passwordVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </Button>
        </div>
        {errors.password && (
          <p id="login-password-error" className={styles.fieldError} role="alert">
            {errors.password.message}
          </p>
        )}
      </AuthReveal>
      <AuthReveal
        className={styles.formOptions}
        delay={authMotion.fields.delay + 2 * authMotion.fields.stagger}
        distance={6}
      >
        <label className={styles.remember}>
          <Controller
            name="rememberMe"
            control={control}
            render={({ field }) => (
              <Checkbox
                name={field.name}
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={!hydrated || isSubmitting}
                className={styles.checkbox}
              />
            )}
          />
          <span>Remember me</span>
        </label>
        <Link className={styles.textLink} href={forgotPasswordHref}>
          Forgot password?
        </Link>
      </AuthReveal>
      {submissionError && (
        <p className={styles.submissionError} role="alert">
          {submissionError}
        </p>
      )}
      <AuthReveal delay={authMotion.fields.delay + 3 * authMotion.fields.stagger} distance={6}>
        <MotionButton
          type="submit"
          data-auth-submit
          className={styles.signInButton}
          disabled={!hydrated || isSubmitting}
          initial={false}
          animate="rest"
          variants={buttonStates}
          whileHover={reducedMotion ? undefined : 'hovered'}
          whileTap={reducedMotion ? undefined : 'pressed'}
          transition={{ type: 'spring', stiffness: 440, damping: 28 }}
          onClick={() => {
            if (!reducedMotion) setPressCount((count) => count + 1);
          }}
        >
          {!reducedMotion && pressCount > 0 && (
            <motion.span
              key={pressCount}
              data-auth-click-feedback
              aria-hidden="true"
              className={styles.buttonSweep}
              initial={{ x: '-120%', opacity: 0 }}
              animate={{ x: '120%', opacity: [0, 0.32, 0] }}
              transition={{ duration: 0.55, ease: authMotion.ease }}
            />
          )}
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" /> Signing in…
            </>
          ) : (
            <>
              <LogIn aria-hidden="true" />
              <span>Sign in</span>
              <motion.span
                className={styles.buttonArrow}
                aria-hidden="true"
                variants={{
                  rest: { x: 0 },
                  hovered: { x: reducedMotion ? 0 : 4 },
                  pressed: { x: 0 },
                }}
              >
                <ArrowRight />
              </motion.span>
            </>
          )}
        </MotionButton>
      </AuthReveal>
    </form>
  );
}
