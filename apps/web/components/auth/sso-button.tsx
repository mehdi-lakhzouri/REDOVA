'use client';

import { useState, type ReactNode } from 'react';
import { Building2, LoaderCircle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './auth.module.css';
import { cn } from '@/lib/utils';

export function SSOButton({
  onContinue,
  className,
  icon: Icon = Building2,
  endIcon,
  disabled,
}: {
  onContinue: () => Promise<void>;
  className?: string;
  icon?: LucideIcon;
  endIcon?: ReactNode;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  async function handleClick() {
    setPending(true);
    try {
      await onContinue();
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(styles.ssoButton, className)}
      onClick={handleClick}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      Continue with SSO
      {endIcon}
    </Button>
  );
}
