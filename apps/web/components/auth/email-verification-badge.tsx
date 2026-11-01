import { Check, Mail } from 'lucide-react';
import styles from './email-verification.module.css';

/** Decorative mail illustration; the check does not indicate account verification. */
export function EmailVerificationBadge() {
  return (
    <div className={styles.badge} aria-hidden>
      <Mail className={styles.badgeMail} strokeWidth={1.6} />
      <span className={styles.badgeCheck}>
        <Check strokeWidth={3.4} />
      </span>
    </div>
  );
}
