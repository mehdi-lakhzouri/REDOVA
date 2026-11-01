'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { routes } from '@/config/site';
import { useSession } from '@/lib/auth-client';
import {
  listOrganizations,
  setActiveOrganization,
  onboardingMessage,
  type OrganizationSummary,
} from '@/lib/onboarding/api';
import { AccountSummary } from '@/app/(app)/dashboard/_components/account-summary';
import { clearOnboardingProgress } from '@/lib/onboarding/progress';

export function WorkspaceHome() {
  const router = useRouter();
  const { data: session } = useSession();
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const organizations = await listOrganizations();
        if (!organizations.length) {
          if (live) router.replace(routes.onboarding);
          return;
        }
        const active =
          organizations.find((value) => value.id === session?.session.activeOrganizationId) ??
          organizations[0];
        if (active.id !== session?.session.activeOrganizationId)
          await setActiveOrganization(active.id);
        if (live) {
          setOrganization(active);
          setError(null);
        }
      } catch (problem) {
        if (live) setError(onboardingMessage(problem, 'Unable to load your workspace.'));
      }
    })();
    return () => {
      live = false;
    };
  }, [router, revision, session?.session.activeOrganizationId]);
  if (error)
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Your workspace</h1>
        <p role="alert" className="my-6 text-destructive">
          {error}
        </p>
        <Button onClick={() => setRevision((value) => value + 1)}>Retry</Button>
      </main>
    );
  if (!organization)
    return (
      <main className="grid min-h-svh place-items-center" role="status">
        Loading your workspace…
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="type-technical text-xs text-primary">REDOVA · workspace</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{organization.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Your workspace is ready. Manage your team and start securing your AI agents.
      </p>
      <div className="mt-8">
        <AccountSummary />
      </div>
      <div className="mt-6 flex flex-wrap gap-4">
        <Button
          render={
            <Link
              href={`${routes.onboarding}?organization=${encodeURIComponent(organization.id)}`}
            />
          }
        >
          Invite team members
        </Button>
        <Button
          variant="outline"
          render={
            <Link
              href={`${routes.onboarding}?new=1`}
              onClick={() => {
                if (session?.user.id) clearOnboardingProgress(session.user.id);
              }}
            />
          }
        >
          Create another workspace
        </Button>
      </div>
    </main>
  );
}
