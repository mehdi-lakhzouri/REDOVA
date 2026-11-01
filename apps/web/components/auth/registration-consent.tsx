'use client';

import Link from 'next/link';
import { Controller, type Control } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import type { RegistrationValues } from './registration-schema';
import styles from './registration.module.css';

export type LegalDocument = 'terms' | 'privacy';
export type RegistrationLegalProps = {
  termsHref?: string;
  privacyHref?: string;
  onOpenDocument: (document: LegalDocument) => void;
};

export function RegistrationConsent({
  control,
  disabled,
  error,
  termsHref,
  privacyHref,
  onOpenDocument,
}: RegistrationLegalProps & {
  control: Control<RegistrationValues>;
  disabled: boolean;
  error?: string;
}) {
  return (
    <div className={styles.consent}>
      <div className={styles.consentRow}>
        <Controller
          name="acceptedTerms"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="registration-terms"
              name={field.name}
              checked={field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={disabled}
              className={styles.checkbox}
              aria-required
              aria-invalid={!!error}
              aria-labelledby="registration-consent-label"
              aria-describedby={error ? 'registration-consent-error' : undefined}
            />
          )}
        />
        <span id="registration-consent-label" className={styles.consentText}>
          <label htmlFor="registration-terms">I agree to the </label>
          {termsHref ? (
            <Link href={termsHref}>Terms of Service</Link>
          ) : (
            <button type="button" onClick={() => onOpenDocument('terms')}>
              Terms of Service
            </button>
          )}
          {' and '}
          {privacyHref ? (
            <Link href={privacyHref}>Privacy Policy</Link>
          ) : (
            <button type="button" onClick={() => onOpenDocument('privacy')}>
              Privacy Policy
            </button>
          )}
          .
        </span>
      </div>
      {error && (
        <p id="registration-consent-error" role="alert" className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
