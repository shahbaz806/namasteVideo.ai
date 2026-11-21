import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PRIVATE_ROUTES = ['/dashboard', '/projects', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Better Auth stores session token in either 'better-auth.session_token' or '__Secure-better-auth.session_token'
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('__Secure-better-auth.session_token')?.value;

  const isPrivateRoute = PRIVATE_ROUTES.some((route) => pathname.startsWith(route));
  const isSignInRoute = pathname === '/sign-in';

  // Protect private routes from anonymous visitors
  if (isPrivateRoute && !sessionToken) {
    const redirectUrl = new URL('/sign-in', request.url);
    const destination = pathname + search;
    if (destination !== '/dashboard') {
      redirectUrl.searchParams.set('redirect', destination);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated creators away from sign-in to dashboard
  if (isSignInRoute && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const response = NextResponse.next();
  // Server correlation header
  if (!response.headers.has('x-request-id')) {
    response.headers.set('x-request-id', `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`);
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/settings/:path*',
    '/sign-in',
  ],
};
