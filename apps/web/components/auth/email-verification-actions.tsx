'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, RotateCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { useCooldown } from '@/hooks/use-cooldown';
import styles from './email-verification.module.css';

const MotionButton = motion.create(Button);

/** The adapter owns the trusted email context, request and server rate-limit handling. */
export type ResendVerificationHandler = () => Promise<{
  error?: string;
  retryAfterSeconds?: number;
} | void>;

export function EmailVerificationActions({ onResend }: { onResend?: ResendVerificationHandler }) {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const { remaining, start } = useCooldown();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function resend() {
    if (!hydrated || inFlight.current || remaining > 0) return;
    setMessage(null);
    if (!onResend) {
      setMessage({
        kind: 'error',
        text: 'Verification emails are not available yet. Please try again later.',
      });
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const result = await onResend();
      if (result?.error) {
        setMessage({ kind: 'error', text: result.error });
        if (result.retryAfterSeconds) start(result.retryAfterSeconds);
        return;
      }
      setMessage({
        kind: 'success',
        text: 'If a verification email can be sent, you’ll receive it shortly. Please check your spam folder too.',
      });
      start(result?.retryAfterSeconds ?? 60);
    } catch {
      setMessage({
        kind: 'error',
        text: 'Unable to resend the verification email. Please try again.',
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className={styles.actions}>
      <noscript>
        <p className={styles.feedback}>
          Enable JavaScript to resend your verification email securely.
        </p>
      </noscript>
      <MotionButton
        type="button"
        className={styles.resendButton}
        onClick={resend}
        disabled={!hydrated || pending || remaining > 0}
        aria-busy={pending}
        aria-describedby={remaining > 0 ? 'verification-resend-cooldown' : undefined}
        initial={false}
        animate="rest"
        whileHover={reducedMotion ? undefined : 'hovered'}
        whileTap={reducedMotion ? undefined : { scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <motion.span
            className={styles.resendIcon}
            variants={{ rest: { rotate: 0 }, hovered: { rotate: reducedMotion ? 0 : 180 } }}
            transition={{ duration: reducedMotion ? 0 : 0.4 }}
          >
            <RotateCw aria-hidden />
          </motion.span>
        )}
        {pending ? 'Resending email…' : remaining > 0 ? `Resend in ${remaining}s` : 'Resend email'}
      </MotionButton>
      {remaining > 0 && (
        <p id="verification-resend-cooldown" className="sr-only">
          Please wait before requesting another verification email.
        </p>
      )}
      {message && (
        <p
          className={styles.feedback}
          data-kind={message.kind}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
