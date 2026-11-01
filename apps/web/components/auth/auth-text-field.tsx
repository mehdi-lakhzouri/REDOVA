import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import styles from './registration.module.css';

type AuthTextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: string;
};

/** The same label/icon/error structure serves both registration identity fields. */
export function AuthTextField({ id, label, icon: Icon, error, ...props }: AuthTextFieldProps) {
  const describedBy =
    [props['aria-describedby'], error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.textField}>
      <Label htmlFor={id} className={styles.label}>
        {label}
      </Label>
      <div className={styles.inputWrap}>
        <Icon className={styles.fieldIcon} aria-hidden />
        <Input
          {...props}
          id={id}
          className={styles.input}
          required
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
