import { Check, Circle, ShieldCheck } from 'lucide-react';
import { passwordRequirements } from './password-policy';
import styles from './reset-password.module.css';

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <section className={styles.requirements} aria-labelledby="password-requirements-title">
      <ShieldCheck aria-hidden className={styles.requirementsShield} />
      <div>
        <h3 id="password-requirements-title">Password requirements</h3>
        <ul>
          {passwordRequirements.map(({ label, test }) => {
            const met = test(password);
            return (
              <li key={label}>
                <span className={styles.requirementState} data-met={met} aria-hidden>
                  {met ? <Check /> : <Circle />}
                </span>
                <span>{label}</span>
                <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
