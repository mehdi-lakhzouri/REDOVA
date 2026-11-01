'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { CenteredAuthCard } from './centered-auth-card';
import styles from './forgot-password.module.css';

export type TwoFactorMethod = 'totp' | 'backup';
export type VerifySecondFactorHandler = (input: {
  method: TwoFactorMethod;
  code: string;
  trustDevice: boolean;
}) => Promise<{ error?: string } | void>;

const TOTP_LENGTH = 6;

const copy = {
  totp: {
    title: 'Two-factor authentication',
    description: 'Enter the 6-digit code from your authenticator app to finish signing in.',
    switchLabel: 'Use a backup code instead',
  },
  backup: {
    title: 'Use a backup code',
    description: 'Enter one of the backup codes you saved when you enabled two-factor sign-in.',
    switchLabel: 'Use your authenticator app instead',
  },
} as const;

/** Second step of sign-in when MFA is enabled; the challenge cookie is valid for 10 minutes. */
export function TwoFactorCard({ onVerify }: { onVerify?: VerifySecondFactorHandler }) {
  const hydrated = useHydrated();
  const [method, setMethod] = useState<TwoFactorMethod>('totp');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = !hydrated || pending;
  const ready = method === 'totp' ? code.length === TOTP_LENGTH : code.trim().length > 0;

  function switchMethod() {
    setMethod((current) => (current === 'totp' ? 'backup' : 'totp'));
    setCode('');
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !onVerify) {
      setError(
        onVerify ? 'Enter your code to continue.' : 'Two-factor sign-in is not available yet.',
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await onVerify({ method, code: code.trim(), trustDevice });
      if (result?.error) {
        setError(result.error);
        setCode('');
      }
    } catch {
      setError('Unable to verify your code. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <CenteredAuthCard
      titleId="two-factor-title"
      title={copy[method].title}
      description={copy[method].description}
      icon={method === 'totp' ? ShieldCheck : KeyRound}
    >
      <form
        method="post"
        className={styles.form}
        onSubmit={submit}
        noValidate
        aria-label={copy[method].title}
        aria-busy={pending}
      >
        <Label htmlFor="two-factor-code" className={styles.label}>
          {method === 'totp' ? 'Authentication code' : 'Backup code'}
        </Label>
        <div className={styles.inputWrap}>
          {method === 'totp' ? (
            <InputOTP
              id="two-factor-code"
              maxLength={TOTP_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              pattern="^[0-9]*$"
              autoComplete="one-time-code"
              autoFocus
              disabled={disabled}
              aria-invalid={!!error}
            >
              <InputOTPGroup>
                {Array.from({ length: TOTP_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-12 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          ) : (
            <Input
              id="two-factor-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              placeholder="xxxxx-xxxxx"
              className={styles.input}
              style={{ paddingLeft: 18 }}
              aria-invalid={!!error}
              disabled={disabled}
              autoFocus
            />
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Checkbox
            id="two-factor-trust"
            checked={trustDevice}
            onCheckedChange={(checked) => setTrustDevice(checked === true)}
            disabled={disabled}
          />
          <Label htmlFor="two-factor-trust" className="text-sm font-normal text-muted-foreground">
            Trust this device for 7 days
          </Label>
        </div>
        {error && (
          <p className={styles.submissionError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className={styles.sendButton} disabled={disabled || !ready}>
          <span className={styles.buttonLabel}>
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {pending ? 'Verifying…' : 'Verify and sign in'}
          </span>
        </Button>
        <button
          type="button"
          onClick={switchMethod}
          disabled={disabled}
          className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline"
        >
          {copy[method].switchLabel}
        </button>
      </form>
    </CenteredAuthCard>
  );
}
