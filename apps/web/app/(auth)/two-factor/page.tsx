import { CenteredAuthLayout } from '@/components/auth/centered-auth-layout';
import { routes } from '@/config/site';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import { TwoFactorView } from './_components/two-factor-view';

export const metadata = createAuthMetadata({
  title: 'Two-factor authentication',
  description: 'Confirm your identity with your authenticator app to sign in to REDOVA.',
  path: routes.twoFactor,
});
export const viewport = authViewport;

export default function TwoFactorPage() {
  return (
    <CenteredAuthLayout
      backgroundSrc="/images/auth/password-recovery-landscape.webp"
      skipTarget="two-factor-code"
      skipLabel="Skip to verification code"
    >
      <TwoFactorView />
    </CenteredAuthLayout>
  );
}
