import type { NextConfig } from 'next';
import { parseServerEnv } from './config/env';

const env = parseServerEnv(process.env);

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Shared DTOs and the response envelope come from the monorepo contracts package.
  transpilePackages: ['@redova/contracts', '@redova/core'],
  /**
   * Same-origin API (README §17.5): the browser calls `/api/auth/*` and `/api/v1/*` on the web
   * origin, so session cookies stay first-party and the API keeps CORS disabled.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${env.REDOVA_API_URL}/api/:path*` }];
  },
  async headers() {
    return ['/forgot-password', '/reset-password', '/sign-up', '/verify-email', '/onboarding'].map(
      (source) => ({
        source,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      }),
    );
  },
  turbopack: {
    rules: {
      '*.css': {
        // Keep CSS Modules on Next's native pipeline so their scoped class exports are preserved.
        condition: { not: { path: '*.module.css' } },
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
