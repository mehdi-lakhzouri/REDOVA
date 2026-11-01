import { Suspense } from 'react';
import { OnboardingLoading, OnboardingView } from '@/components/onboarding/onboarding-view';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import { routes } from '@/config/site';

export const metadata = createAuthMetadata({
  title: 'Organization onboarding',
  description: 'Set up your REDOVA organization and invite your team securely.',
  path: routes.onboarding,
});
export const viewport = authViewport;
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingView />
    </Suspense>
  );
}
