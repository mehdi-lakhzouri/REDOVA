import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/auth-layout';
import { AuthHero } from '@/components/auth/auth-hero';
import { SignInView } from './_components/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to REDOVA. Secure AI agents, confidently.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthLayout hero={<AuthHero />}>
      <SignInView />
    </AuthLayout>
  );
}
