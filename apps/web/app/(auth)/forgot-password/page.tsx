import { CenteredAuthLayout } from '@/components/auth/centered-auth-layout';
import { routes } from '@/config/site';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import { ForgotPasswordView } from './_components/forgot-password-view';

export const metadata = createAuthMetadata({
  title: 'Forgot your password',
  description: 'Request a secure password reset link for your REDOVA account.',
  path: routes.forgotPassword,
});
export const viewport = authViewport;

export default function ForgotPasswordPage() {
  return (
    <CenteredAuthLayout
      backgroundSrc="/images/auth/password-recovery-landscape.webp"
      skipTarget="recovery-email"
      skipLabel="Skip to password recovery"
    >
      <ForgotPasswordView />
    </CenteredAuthLayout>
  );
}
