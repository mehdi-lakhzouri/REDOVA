export type OnboardingStep = 'organization' | 'invitations';
export type OnboardingProgress = { organizationId: string; step: OnboardingStep };
const key = (userId: string) => `redova.onboarding:${userId}`;
/** Convenience only; IDs are always checked against server memberships before resuming. */
export function readOnboardingProgress(userId: string): OnboardingProgress | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(userId)) ?? 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      !('organizationId' in value) ||
      typeof value.organizationId !== 'string' ||
      !('step' in value) ||
      !['organization', 'invitations'].includes(String(value.step))
    )
      return null;
    return value as OnboardingProgress;
  } catch {
    return null;
  }
}
export function saveOnboardingProgress(userId: string, value: OnboardingProgress): void {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
export function clearOnboardingProgress(userId: string): void {
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* Storage is optional. */
  }
}
