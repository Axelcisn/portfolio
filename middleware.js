// middleware.js
import { NextResponse } from 'next/server';

export function middleware(request) {
  // Simply pass through all requests
  return NextResponse.next();
}

// Optionally configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
