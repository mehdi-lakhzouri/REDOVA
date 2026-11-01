'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { routes } from '@/config/site';
import { useHydrated } from '@/hooks/use-hydrated';
import { AuthReveal } from './auth-reveal';
import { SSOButton } from './sso-button';
import { RegistrationForm } from './registration-form';
import type { SignUpHandler } from './registration-schema';
import type { LegalDocument } from './registration-consent';
import styles from './registration.module.css';

const notices = {
  terms: {
    title: 'Terms of Service',
    description:
      'Our Terms of Service will be available soon. Please contact your workspace administrator if you need more information.',
  },
  privacy: {
    title: 'Privacy Policy',
    description:
      'Our Privacy Policy will be available soon. Please contact your workspace administrator if you need more information.',
  },
  sso: {
    title: 'Single sign-on',
    description:
      'Single sign-on is not available yet. Please contact your workspace administrator for your sign-in options.',
  },
  ssoError: {
    title: 'Unable to start single sign-on',
    description:
      'Please try again, or contact your workspace administrator if the problem continues.',
  },
} as const;

export type RegistrationCardProps = {
  onSignUp?: SignUpHandler;
  onSSO?: () => Promise<void>;
  termsHref?: string;
  privacyHref?: string;
};

export function RegistrationCard({
  onSignUp,
  onSSO,
  termsHref,
  privacyHref,
}: RegistrationCardProps) {
  const hydrated = useHydrated();
  const [notice, setNotice] = useState<keyof typeof notices | null>(null);
  async function continueWithSSO() {
    if (!onSSO) {
      setNotice('sso');
      return;
    }
    try {
      await onSSO();
    } catch {
      setNotice('ssoError');
    }
  }
  function openDocument(document: LegalDocument) {
    setNotice(document);
  }

  return (
    <>
      <AuthReveal className={styles.cardFrame} delay={0.08} distance={18}>
        <Card className={styles.card} role="region" aria-labelledby="registration-title">
          <div className={styles.cardEyebrow}>
            <span>CREATE ACCOUNT</span>
            <span className={styles.indicators} aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </div>
          <header className={styles.cardHeader}>
            <h2 id="registration-title">
              Create your <span>REDOVA</span> account
            </h2>
            <p>Start testing, securing, and empowering your AI agents.</p>
          </header>
          <RegistrationForm
            onSignUp={onSignUp}
            termsHref={termsHref}
            privacyHref={privacyHref}
            onOpenDocument={openDocument}
          />
          <AuthReveal className={styles.divider} delay={0.66} distance={6} decorative>
            <span />
            OR
            <span />
          </AuthReveal>
          <AuthReveal delay={0.7} distance={6}>
            <SSOButton
              onContinue={continueWithSSO}
              disabled={!hydrated}
              className={styles.ssoButton}
              icon={ShieldCheck}
              endIcon={<ArrowRight className={styles.ssoArrow} aria-hidden />}
            />
          </AuthReveal>
          <AuthReveal as="p" className={styles.signInPrompt} delay={0.74} distance={6}>
            <span>Already have an account?</span>
            <Link href={routes.signIn}>
              Sign in
              <ArrowRight aria-hidden />
            </Link>
          </AuthReveal>
        </Card>
      </AuthReveal>
      <Dialog
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
      >
        <DialogContent className="dark border border-border text-foreground">
          <DialogHeader>
            <DialogTitle>{notice ? notices[notice].title : ''}</DialogTitle>
            <DialogDescription>{notice ? notices[notice].description : ''}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>Got it</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
