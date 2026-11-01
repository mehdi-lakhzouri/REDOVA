'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm, type SignInHandler } from './login-form';
import { SSOButton } from './sso-button';
import styles from './auth.module.css';
import { AuthReveal } from './auth-reveal';
import { authMotion } from './auth-motion';
import { routes } from '@/config/site';

const MotionCard = motion.create(Card);

export type LoginCardProps = {
  onSignIn?: SignInHandler;
  onSSO?: () => Promise<void>;
  forgotPasswordHref?: string;
  signUpHref?: string;
};

const notices = {
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

/** Route/handler props are the integration boundary; the visual components contain no auth provider logic. */
export function LoginCard({
  onSignIn,
  onSSO,
  forgotPasswordHref = routes.forgotPassword,
  signUpHref = routes.signUp,
}: LoginCardProps) {
  const reducedMotion = useReducedMotion();
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
  return (
    <>
      <MotionCard
        data-auth-reveal
        className={styles.card}
        role="region"
        aria-labelledby="login-title"
        initial={{ opacity: 0, scale: 0.955, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: reducedMotion ? 0 : authMotion.card.duration,
          delay: reducedMotion ? 0 : authMotion.card.delay,
          ease: authMotion.ease,
        }}
      >
        <div className={styles.cardBrand}>
          <BrandLogo
            variant="mark"
            appearance="dark"
            className={styles.cardMark}
            decorative
            preload
          />
          <BrandLogo variant="wordmark" appearance="dark" className={styles.cardWordmark} preload />
        </div>
        <header className={styles.cardHeader}>
          <h2 id="login-title">Welcome back</h2>
          <p>Sign in to your REDOVA account</p>
        </header>
        <LoginForm onSignIn={onSignIn} forgotPasswordHref={forgotPasswordHref} />
        <AuthReveal className={styles.divider} delay={0.64} distance={6} decorative>
          <span />
          OR
          <span />
        </AuthReveal>
        <AuthReveal delay={0.68} distance={6}>
          <SSOButton onContinue={continueWithSSO} />
        </AuthReveal>
        <AuthReveal as="p" className={styles.createAccount} delay={authMotion.footer} distance={6}>
          Don’t have an account? <Link href={signUpHref}>Create account</Link>
        </AuthReveal>
      </MotionCard>
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
