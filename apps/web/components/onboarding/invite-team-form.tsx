'use client';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  LoaderCircle,
  Mail,
  Plus,
  UsersRound,
  X,
} from 'lucide-react';
import { ORG_ROLE_LABELS } from '@redova/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHydrated } from '@/hooks/use-hydrated';
import {
  allowedInvitationRoles,
  invitationSchema,
  MAX_INVITATION_ROWS,
  type InvitationValues,
  type InvitableRole,
} from '@/lib/onboarding/policy';
import { onboardingMessage } from '@/lib/onboarding/api';
import { InvitationRules } from './rules-panel';
import styles from './onboarding.module.css';

export type InviteRow = { id: string; email: string; role: InvitableRole };
export type InviteOutcome = { id: string; sent: boolean; error?: string };
export function InviteTeamForm({
  email,
  role,
  onSend,
  onFinish,
  onBack,
}: {
  email: string;
  role: string;
  onSend: (rows: InviteRow[]) => Promise<InviteOutcome[]>;
  onFinish: () => Promise<void>;
  onBack: () => void;
}) {
  const hydrated = useHydrated();
  const schema = useMemo(() => invitationSchema(email), [email]);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InvitationValues>({
    resolver: zodResolver(schema),
    defaultValues: { members: [{ email: '', role: 'VIEWER' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'members' });
  const [outcomes, setOutcomes] = useState<Record<string, InviteOutcome>>({});
  const [finishing, setFinishing] = useState(false);
  const disabled = !hydrated || isSubmitting || finishing;
  const sentCount = Object.values(outcomes).filter((value) => value.sent).length;
  async function finish() {
    setFinishing(true);
    try {
      await onFinish();
    } catch (error) {
      setError('root', {
        message: onboardingMessage(error, 'Unable to open the workspace. Please try again.'),
      });
    } finally {
      setFinishing(false);
    }
  }
  async function submit(values: InvitationValues) {
    const pending = values.members
      .map((member, index) => ({
        ...member,
        email: member.email.toLowerCase(),
        id: fields[index].id,
      }))
      .filter((member) => member.email && !outcomes[member.id]?.sent);
    if (!pending.length) {
      if (sentCount) {
        await finish();
        return;
      }
      setError('members.0.email', { message: 'Add an email address, or skip this step.' });
      return;
    }
    try {
      const result = await onSend(pending);
      setOutcomes((current) => ({
        ...current,
        ...Object.fromEntries(result.map((value) => [value.id, value])),
      }));
      if (result.every((value) => value.sent)) await finish();
    } catch (error) {
      setError('root', {
        message: onboardingMessage(error, 'Unable to send invitations. Please try again.'),
      });
    }
  }
  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit(submit)}
      aria-label="Invite your team"
      aria-busy={disabled && hydrated}
    >
      <div className={styles.sectionTitle}>
        <span className={styles.sectionIcon}>
          <UsersRound aria-hidden />
        </span>
        <div>
          <h1 id="onboarding-title" tabIndex={-1}>
            Invite your team
          </h1>
          <p>Bring teammates into your REDOVA workspace. Assign each person a role.</p>
        </div>
      </div>
      <div className={styles.workArea}>
        <section className={styles.teamMembers}>
          <div className={styles.membersHeading}>
            <h2>Team members</h2>
            <span>
              {sentCount
                ? `${sentCount} sent`
                : `${fields.length} invitation${fields.length > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className={styles.inviteColumnLabels} aria-hidden>
            <span>WORK EMAIL</span>
            <span>ORGANIZATION ROLE</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const outcome = outcomes[field.id];
            const problem = errors.members?.[index]?.email?.message || outcome?.error;
            return (
              <div key={field.id} className={styles.inviteRowGroup}>
                <div className={styles.inviteRow}>
                  <div className={styles.inputWrap}>
                    <Mail aria-hidden />
                    <Input
                      className={styles.input}
                      type="email"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="name@company.com"
                      aria-label={`Work email ${index + 1}`}
                      aria-invalid={!!problem}
                      aria-describedby={problem ? `invite-error-${index}` : undefined}
                      disabled={disabled || outcome?.sent}
                      {...register(`members.${index}.email`)}
                    />
                  </div>
                  <select
                    className={styles.roleSelect}
                    aria-label={`Organization role ${index + 1}`}
                    disabled={disabled || outcome?.sent}
                    {...register(`members.${index}.role`)}
                  >
                    {allowedInvitationRoles(role).map((value) => (
                      <option key={value} value={value}>
                        {ORG_ROLE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {outcome?.sent ? (
                    <span className={styles.sentMark} aria-label="Invitation sent">
                      <Check aria-hidden />
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove team member ${index + 1}`}
                      disabled={disabled || fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </div>
                {problem && !outcome?.sent && (
                  <p id={`invite-error-${index}`} className={styles.error} role="alert">
                    {problem}
                  </p>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className={styles.addMember}
            disabled={disabled || fields.length >= MAX_INVITATION_ROWS}
            onClick={() => append({ email: '', role: 'VIEWER' })}
          >
            <Plus aria-hidden />
            Add another member
          </Button>
          <p className={styles.fieldNote}>
            <Info aria-hidden />
            <span>
              Each invitation is valid for <strong>7 days</strong>. Members receive an email with a
              secure invitation link. You can invite more people later.
            </span>
          </p>
          {sentCount > 0 && (
            <p className={styles.inlineNotice} role="status">
              Sent invitations are kept. You can retry failed rows or skip for now.
            </p>
          )}
        </section>
        <InvitationRules role={role} />
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
          className={`${styles.secondaryButton} ${styles.backButton}`}
          disabled={disabled || sentCount > 0}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={styles.skipButton}
          disabled={disabled}
          onClick={finish}
        >
          Skip for now
        </Button>
        <Button type="submit" className={styles.primaryButton} disabled={disabled}>
          {disabled && hydrated ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {isSubmitting
            ? 'Sending…'
            : finishing
              ? 'Opening workspace…'
              : sentCount
                ? 'Retry / continue'
                : 'Send invitations'}
          <ArrowRight aria-hidden />
        </Button>
      </footer>
    </form>
  );
}
