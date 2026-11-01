'use client';
import { useEffect, useState } from 'react';
import { validateOrgSlug } from '@redova/core';
import { checkSlug, onboardingMessage } from '@/lib/onboarding/api';

type Result = {
  slug: string;
  revision: number;
  status: 'available' | 'taken' | 'error';
  message?: string;
};
export function useSlugAvailability(slug: string, enabled = true) {
  const [result, setResult] = useState<Result | null>(null);
  const [revision, setRevision] = useState(0);
  const eligible = enabled && validateOrgSlug(slug) === null;
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const available = await checkSlug(slug, controller.signal);
        if (!controller.signal.aborted)
          setResult({ slug, revision, status: available ? 'available' : 'taken' });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            slug,
            revision,
            status: 'error',
            message: onboardingMessage(error, 'Unable to check availability.'),
          });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, eligible, revision]);
  const status = !eligible
    ? 'idle'
    : result?.slug === slug && result.revision === revision
      ? result.status
      : 'checking';
  return {
    status,
    message: status === 'error' ? result?.message : undefined,
    retry: () => setRevision((value) => value + 1),
  };
}
