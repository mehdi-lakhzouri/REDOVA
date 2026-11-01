'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { authMotion } from './auth-motion';

type AuthRevealProps = {
  children: ReactNode;
  as?: 'div' | 'p' | 'li' | 'span';
  className?: string;
  delay?: number;
  axis?: 'x' | 'y';
  distance?: number;
  decorative?: boolean;
};

export function AuthReveal({
  children,
  as = 'div',
  className,
  delay = 0,
  axis = 'y',
  distance = 10,
  decorative,
}: AuthRevealProps) {
  const reducedMotion = useReducedMotion();
  const Element = { div: motion.div, p: motion.p, li: motion.li, span: motion.span }[as];
  return (
    <Element
      data-auth-reveal
      className={className}
      aria-hidden={decorative || undefined}
      // Keep initial HTML identical on the server and client; CSS exposes reduced-motion content immediately.
      initial={{ opacity: 0, x: axis === 'x' ? -distance : 0, y: axis === 'y' ? distance : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: reducedMotion ? 0 : authMotion.revealDuration,
        delay: reducedMotion ? 0 : delay,
        ease: authMotion.ease,
      }}
    >
      {children}
    </Element>
  );
}
