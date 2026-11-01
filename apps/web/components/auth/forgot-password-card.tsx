import { Mail } from 'lucide-react';
import { CenteredAuthCard } from './centered-auth-card';
import { ForgotPasswordForm, type RequestPasswordResetHandler } from './forgot-password-form';

export function ForgotPasswordCard({
  onRequestReset,
}: {
  onRequestReset?: RequestPasswordResetHandler;
}) {
  return (
    <CenteredAuthCard
      titleId="recovery-title"
      title="Reset your password"
      icon={Mail}
      description="Enter the email address associated with your REDOVA account and we’ll send you a secure link to reset your password."
    >
      <ForgotPasswordForm onRequestReset={onRequestReset} />
    </CenteredAuthCard>
  );
}
