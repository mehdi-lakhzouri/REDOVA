import type { Metadata } from 'next';
import { AccountSummary } from './_components/account-summary';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

/** Placeholder home for signed-in users until the workspace screens land. */
export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">You’re signed in</h1>
      <AccountSummary />
    </main>
  );
}
