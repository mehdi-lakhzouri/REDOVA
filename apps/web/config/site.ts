/** Brand and SEO settings shared by metadata, layouts, `robots.ts` and `sitemap.ts`. */
export const siteConfig = {
  name: 'REDOVA',
  tagline: 'Agentic AI security testing',
  description:
    'REDOVA runs automated red-teaming against your AI agents and turns the results into findings, evidence and reports aligned with the OWASP Agentic AI Top 10.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en',
  contactEmail: 'contact@redova.io',
} as const;

/** Application routes, so links never hard-code paths. */
export const routes = {
  home: '/',
  pricing: '/pricing',
  signIn: '/sign-in',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  signUp: '/sign-up',
  verifyEmail: '/verify-email',
  twoFactor: '/two-factor',
  dashboard: '/dashboard',
  onboarding: '/onboarding',
} as const;
