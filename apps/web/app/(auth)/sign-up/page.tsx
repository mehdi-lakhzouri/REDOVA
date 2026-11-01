import { AuthLayout } from '@/components/auth/auth-layout';
import { RegistrationHero } from '@/components/auth/registration-hero';
import { routes } from '@/config/site';
import { authViewport, createAuthMetadata } from '@/lib/auth-metadata';
import styles from '@/components/auth/registration.module.css';
import { SignUpView } from './_components/sign-up-view';

export const metadata = createAuthMetadata({
  title: 'Create your account',
  description: 'Create your REDOVA account to start testing and securing your AI agents.',
  path: routes.signUp,
});
export const viewport = authViewport;

export default function RegistrationPage() {
  return (
    <AuthLayout
      hero={<RegistrationHero />}
      className={styles.layout}
      cardAreaClassName={styles.cardArea}
      sceneryClassName={styles.scenery}
      backgroundSrc="/images/auth/registration-security-background.webp"
      skipTarget="registration-name"
      skipLabel="Skip to registration"
    >
      <SignUpView />
    </AuthLayout>
  );
}
