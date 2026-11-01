import type { Metadata } from 'next';
import { WorkspaceHome } from '@/components/onboarding/workspace-home';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

/** Existing members enter their workspace; accounts without a workspace continue onboarding. */
export default function DashboardPage() {
  return <WorkspaceHome />;
}
