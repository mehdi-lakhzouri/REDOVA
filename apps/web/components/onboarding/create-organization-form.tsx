'use client';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Building2, Check, Info, Link2, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { useSlugAvailability } from '@/hooks/use-slug-availability';
import {
  organizationSchema,
  suggestSlug,
  logoProblem,
  type OrganizationInput,
  type LogoSelection,
} from '@/lib/onboarding/policy';
import { onboardingMessage, type OrganizationSummary } from '@/lib/onboarding/api';
import { LogoPicker } from './logo-picker';
import { OrganizationRules } from './rules-panel';
import styles from './onboarding.module.css';

export function CreateOrganizationForm({
  organization,
  limitReached,
  onSave,
  onCancel,
}: {
  organization: OrganizationSummary | null;
  limitReached: boolean;
  onSave: (values: OrganizationInput, logo: LogoSelection) => Promise<void>;
  onCancel: () => void;
}) {
  const hydrated = useHydrated();
  const editedSlug = useRef(false);
  const [logo, setLogo] = useState<LogoSelection>(
    organization?.logo ? { kind: 'keep' } : { kind: 'none' },
  );
  const [logoError, setLogoError] = useState<string | undefined>();
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<OrganizationInput>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: organization?.name ?? '', slug: organization?.slug ?? '' },
  });
  const slug = useWatch({ control, name: 'slug' });
  const availability = useSlugAvailability(slug, !organization);
  const disabled = !hydrated || isSubmitting || (limitReached && !organization);
  const nameField = register('name');
  const slugField = register('slug');
  async function submit(values: OrganizationInput) {
    const problem = logoProblem(logo);
    setLogoError(problem ?? undefined);
    if (problem) return;
    if (!organization && availability.status !== 'available') {
      setError('slug', { message: 'Check that this slug is available before continuing.' });
      return;
    }
    try {
      await onSave(values, logo);
    } catch (error) {
      setError('root', {
        message: onboardingMessage(error, 'Unable to save your organization. Please try again.'),
      });
    }
  }
  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit(submit)}
      aria-label="Create your organization"
      aria-busy={isSubmitting}
    >
      <noscript>
        <p className={styles.error}>Enable JavaScript to set up your workspace.</p>
      </noscript>
      <div className={styles.workArea}>
        <section>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>
              <Building2 aria-hidden />
            </span>
            <div>
              <h2>Create your organization</h2>
              <p>Define your organization details to get started.</p>
            </div>
          </div>
          {organization && (
            <p className={styles.inlineNotice}>
              Your organization is created. You can update its name and logo here; its slug stays
              unchanged.
            </p>
          )}
          {limitReached && !organization && (
            <p className={styles.error} role="alert">
              You have reached the creation limit. Return to an existing workspace.
            </p>
          )}
          <div className={styles.fields}>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <Label htmlFor="organization-name">
                  Organization name <span>*</span>
                </Label>
                <span>2 – 64 characters</span>
              </div>
              <div className={styles.inputWrap}>
                <Building2 aria-hidden />
                <Input
                  id="organization-name"
                  className={styles.input}
                  placeholder="My Organization"
                  maxLength={64}
                  disabled={disabled}
                  required
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'organization-name-error' : undefined}
                  {...nameField}
                  onChange={(event) => {
                    nameField.onChange(event);
                    if (!organization && !editedSlug.current)
                      setValue('slug', suggestSlug(event.target.value));
                  }}
                />
              </div>
              {errors.name && (
                <p id="organization-name-error" className={styles.error} role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <Label htmlFor="organization-slug">
                  Organization slug <span>*</span>
                </Label>
                <span>3 – 48 characters</span>
              </div>
              <div className={styles.slugRow}>
                <div className={styles.inputWrap}>
                  <Link2 aria-hidden />
                  <Input
                    id="organization-slug"
                    className={styles.input}
                    placeholder="my-organization"
                    maxLength={48}
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={disabled || !!organization}
                    required
                    aria-invalid={!!errors.slug}
                    aria-describedby={`organization-slug-note organization-slug-status${errors.slug ? ' organization-slug-error' : ''}`}
                    {...slugField}
                    onChange={(event) => {
                      editedSlug.current = true;
                      slugField.onChange(event);
                    }}
                  />
                </div>
                <span
                  id="organization-slug-status"
                  className={styles.slugStatus}
                  data-status={organization ? 'locked' : availability.status}
                  aria-live="polite"
                >
                  {organization ? (
                    <>
                      <LockKeyhole aria-hidden />
                      Locked
                    </>
                  ) : availability.status === 'checking' ? (
                    <>
                      <LoaderCircle className="animate-spin" aria-hidden />
                      Checking
                    </>
                  ) : availability.status === 'available' ? (
                    <>
                      <Check aria-hidden />
                      Available
                    </>
                  ) : availability.status === 'taken' ? (
                    'Taken'
                  ) : availability.status === 'error' ? (
                    'Check failed'
                  ) : (
                    'Not checked'
                  )}
                </span>
              </div>
              <p id="organization-slug-note" className={styles.fieldNote}>
                <Info aria-hidden />
                <span>
                  The slug is unique and <strong>cannot be changed</strong> after creation.
                </span>
              </p>
              {errors.slug && (
                <p id="organization-slug-error" className={styles.error} role="alert">
                  {errors.slug.message}
                </p>
              )}
              {availability.status === 'error' && (
                <p className={styles.error} role="alert">
                  {availability.message}{' '}
                  <button type="button" onClick={availability.retry}>
                    Retry check
                  </button>
                </p>
              )}
            </div>
            <div className={styles.field}>
              <p className={styles.fieldLabel}>
                Organization logo <span>(optional)</span>
              </p>
              <LogoPicker
                value={logo}
                onChange={(value) => {
                  setLogo(value);
                  setLogoError(undefined);
                }}
                existingLogo={organization?.logo}
                disabled={disabled}
                error={logoError}
              />
            </div>
          </div>
        </section>
        <OrganizationRules />
      </div>
      {errors.root && (
        <p className={styles.errorBox} role="alert">
          {errors.root.message}
        </p>
      )}
      <footer className={styles.footer}>
        <Button
          type="button"
          variant="outline"
          className={styles.secondaryButton}
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={styles.primaryButton}
          disabled={
            disabled ||
            (!organization && ['checking', 'taken', 'error'].includes(availability.status))
          }
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              Continue
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </footer>
    </form>
  );
}
