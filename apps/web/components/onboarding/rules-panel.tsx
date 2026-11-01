import { Building2, ImageIcon, Link2, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ORG_ROLE_LABELS } from '@redova/contracts';
import { allowedInvitationRoles } from '@/lib/onboarding/policy';
import styles from './onboarding.module.css';

export function OrganizationRules() {
  return (
    <Card className={styles.rules} aria-labelledby="organization-rules-title">
      <h3 id="organization-rules-title">
        <ShieldCheck aria-hidden />
        Rules &amp; limits
      </h3>
      <ul>
        <li>
          <Building2 aria-hidden />
          <span>
            <strong>Name:</strong> 2 to 64 characters.
          </span>
        </li>
        <li>
          <Link2 aria-hidden />
          <span>
            <strong>Slug:</strong> 3 to 48 lowercase letters, numbers and hyphens; start and end
            with a letter or number.
          </span>
        </li>
        <li>
          <ImageIcon aria-hidden />
          <span>
            <strong>Logo:</strong> optional PNG, JPG or WebP, up to 2 MB. HTTPS image URLs are also
            supported.
          </span>
        </li>
        <li>
          <LockKeyhole aria-hidden />
          <span>
            The slug is <em>immutable</em> after creation.
          </span>
        </li>
        <li>
          <UsersRound aria-hidden />
          <span>
            Creation limit: <em>3 organizations</em> per account.
          </span>
        </li>
      </ul>
    </Card>
  );
}
export function InvitationRules({ role }: { role: string }) {
  return (
    <Card className={styles.rules} aria-labelledby="invitation-rules-title">
      <h3 id="invitation-rules-title">
        <ShieldCheck aria-hidden />
        Access &amp; roles
      </h3>
      <section>
        <h4>Secure by default</h4>
        <p>Everyone gets only the permissions assigned to their role.</p>
      </section>
      <section>
        <h4>Available roles</h4>
        <ul className={styles.rolesList}>
          {allowedInvitationRoles(role).map((value) => (
            <li key={value}>{ORG_ROLE_LABELS[value]}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Organization ownership</h4>
        <p>
          {role === 'ORG_OWNER'
            ? 'You own this organization and can manage members at any time.'
            : 'You can invite people with roles below your own. The owner manages organization ownership.'}
        </p>
      </section>
    </Card>
  );
}
