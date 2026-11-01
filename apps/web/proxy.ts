import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { routes } from '@/config/site';
import { AUTH_COOKIE_PREFIX } from '@/lib/auth/session-cookie';

/**
 * Optimistic check only: a missing session cookie skips rendering protected pages. The cookie is
 * not validated here; the API validates every request and the client guard handles stale cookies.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) return NextResponse.next();

  const signIn = new URL(routes.signIn, request.url);
  signIn.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
};
