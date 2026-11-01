'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import styles from './reset-password.module.css';

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type' | 'id'> & {
  id: string;
  label: string;
  error?: string;
  leadingIcon?: LucideIcon;
};

export function PasswordField({
  id,
  label,
  error,
  className,
  disabled,
  leadingIcon: LeadingIcon,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const describedBy =
    [props['aria-describedby'], error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn(styles.passwordField, className)}>
      <Label htmlFor={id} className={styles.label}>
        {label}
      </Label>
      <div className={styles.inputWrap}>
        {LeadingIcon && <LeadingIcon className={styles.leadingIcon} aria-hidden />}
        <Input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          autoComplete="new-password"
          aria-invalid={!!error}
          aria-describedby={describedBy}
          required
          className={cn(styles.input, LeadingIcon && styles.inputWithIcon)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={styles.visibilityToggle}
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-controls={id}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
