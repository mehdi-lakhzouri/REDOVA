'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthReveal } from '@/components/auth/auth-reveal';
import { useSession } from '@/lib/auth-client';
import { routes } from '@/config/site';
import {
  createOrganization,
  listOrganizations,
  organizationRole,
  setActiveOrganization,
  updateOrganization,
  uploadOrganizationLogo,
  removeOrganizationLogo,
  inviteMember,
  onboardingMessage,
  type OrganizationSummary,
} from '@/lib/onboarding/api';
import {
  allowedInvitationRoles,
  canInvite,
  type OrganizationInput,
  type LogoSelection,
} from '@/lib/onboarding/policy';
import {
  clearOnboardingProgress,
  readOnboardingProgress,
  saveOnboardingProgress,
  type OnboardingStep,
} from '@/lib/onboarding/progress';
import { OnboardingLayout } from './onboarding-layout';
import { OnboardingStepper } from './onboarding-stepper';
import { CreateOrganizationForm } from './create-organization-form';
import { InviteTeamForm, type InviteOutcome, type InviteRow } from './invite-team-form';
import styles from './onboarding.module.css';

export function OnboardingLoading() {
  return (
    <div className={styles.loading} role="status">
      <LoaderCircle className="animate-spin" aria-hidden />
      <span>Loading workspace setup…</span>
    </div>
  );
}

export function OnboardingView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const userId = session?.user.id;
  const forceNew = params.get('new') === '1';
  const requestedOrganization = params.get('organization');
  const initialActiveId = useRef(session?.session.activeOrganizationId);
  const [step, setStep] = useState<OnboardingStep>('organization');
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
  const [role, setRole] = useState('');
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedRequest, setLoadedRequest] = useState('');
  const requestKey = `${userId}:${forceNew}:${requestedOrganization}:${revision}`;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    async function load() {
      try {
        const organizations = await listOrganizations();
        if (!live) return;
        setCount(organizations.length);
        const progress = readOnboardingProgress(userId!);
        const id = requestedOrganization || progress?.organizationId;
        const existing = id ? organizations.find((value) => value.id === id) : null;
        if (requestedOrganization && !existing) throw new Error('Workspace not available');
        if (existing) {
          const memberRole = await organizationRole(existing.id);
          if (!live) return;
          setOrganization(existing);
          setRole(memberRole);
          setStep(requestedOrganization ? 'invitations' : (progress?.step ?? 'invitations'));
        } else if (!forceNew && organizations.length) {
          const preferred =
            organizations.find((value) => value.id === initialActiveId.current) ?? organizations[0];
          await setActiveOrganization(preferred.id);
          if (live) router.replace(routes.dashboard);
          return;
        } else {
          setOrganization(null);
          setStep('organization');
        }
        if (live) {
          setLoading(false);
          setLoadedRequest(requestKey);
          setError(null);
        }
      } catch (problem) {
        if (live) {
          setError(onboardingMessage(problem, 'Unable to load your workspaces. Please retry.'));
          setLoading(false);
          setLoadedRequest(requestKey);
        }
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [userId, forceNew, requestedOrganization, revision, router, requestKey]);

  async function save(values: OrganizationInput, logo: LogoSelection) {
    let current: OrganizationSummary;
    if (organization)
      current = await updateOrganization(organization, {
        name: values.name,
        ...(logo.kind === 'url' ? { logo: logo.url.trim() } : {}),
      });
    else
      current = await createOrganization({
        ...values,
        ...(logo.kind === 'url' ? { logo: logo.url.trim() } : {}),
      });
    // Commit the known ID before uploading: retries never create a second organization.
    setOrganization(current);
    saveOnboardingProgress(userId!, { organizationId: current.id, step: 'organization' });
    if (logo.kind === 'file')
      current = { ...current, logo: await uploadOrganizationLogo(current.id, logo.file) };
    else if (logo.kind === 'none' && current.logo) {
      await removeOrganizationLogo(current.id);
      current = { ...current, logo: null };
    }
    setOrganization(current);
    const memberRole = await organizationRole(current.id);
    setRole(memberRole);
    setStep('invitations');
    saveOnboardingProgress(userId!, { organizationId: current.id, step: 'invitations' });
  }
  async function send(rows: InviteRow[]): Promise<InviteOutcome[]> {
    if (!organization) throw new Error('Missing organization');
    const outcomes: InviteOutcome[] = [];
    for (const row of rows) {
      try {
        if (!allowedInvitationRoles(role).includes(row.role)) throw new Error('Role not allowed');
        await inviteMember(organization.id, row.email, row.role);
        outcomes.push({ id: row.id, sent: true });
      } catch (problem) {
        outcomes.push({
          id: row.id,
          sent: false,
          error: onboardingMessage(
            problem,
            'Unable to send this invitation. Check the email and your permissions.',
          ),
        });
      }
    }
    return outcomes;
  }
  async function finish() {
    if (!organization) throw new Error('Missing organization');
    await setActiveOrganization(organization.id);
    clearOnboardingProgress(userId!);
    router.replace(routes.dashboard);
  }
  function back() {
    setStep('organization');
    if (organization)
      saveOnboardingProgress(userId!, { organizationId: organization.id, step: 'organization' });
  }

  return (
    <OnboardingLayout step={step}>
      {loading || loadedRequest !== requestKey ? (
        <OnboardingLoading />
      ) : error ? (
        <Card className={styles.statusCard}>
          <h1 id="onboarding-title" tabIndex={-1}>
            Workspace setup
          </h1>
          <p role="alert">{error}</p>
          <Button
            onClick={() => {
              setError(null);
              setLoading(true);
              setRevision((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </Card>
      ) : organization && role && !canInvite(role) ? (
        <Card className={styles.statusCard}>
          <h1 id="onboarding-title">Your workspace is ready</h1>
          <p>Your role does not allow changing organization details or inviting members.</p>
          <Button
            onClick={() => {
              void finish().catch((problem) =>
                setError(onboardingMessage(problem, 'Unable to open this workspace.')),
              );
            }}
          >
            Continue to workspace
          </Button>
        </Card>
      ) : (
        <AuthReveal key={step} distance={14} delay={0.08} className={styles.cardFrame}>
          <Card className={styles.workspaceCard}>
            <header className={styles.cardHeader}>
              {step === 'organization' ? (
                <>
                  <h1 id="onboarding-title" tabIndex={-1}>
                    Organization <span>Onboarding</span>
                  </h1>
                  <p>Set up your organization and invite your team to collaborate on REDOVA.</p>
                </>
              ) : (
                <div className={styles.setupEyebrow}>
                  <span>WORKSPACE SETUP</span>
                  <p>
                    Organization: <strong>{organization?.name}</strong>
                  </p>
                </div>
              )}
              <OnboardingStepper step={step} />
            </header>
            {step === 'organization' ? (
              <CreateOrganizationForm
                organization={organization}
                limitReached={count >= 3}
                onSave={save}
                onCancel={() =>
                  router.push(organization || count > 0 ? routes.dashboard : routes.home)
                }
              />
            ) : (
              <InviteTeamForm
                email={session!.user.email}
                role={role}
                onSend={send}
                onFinish={finish}
                onBack={back}
              />
            )}
          </Card>
        </AuthReveal>
      )}
    </OnboardingLayout>
  );
}
