import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "businessos_session";
const DEFAULT_SECRET = "businessos_super_secure_development_secret_key_2026_x89f!";

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret === DEFAULT_SECRET || secret.length < 32) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: In production mode, SESSION_SECRET must be explicitly set with at least 32 characters and cannot use default development keys."
      );
    }
    return new TextEncoder().encode(secret);
  }
  return new TextEncoder().encode(secret || DEFAULT_SECRET);
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: "businessos",
      audience: "businessos-users",
    });
    return !!(payload.userId && payload.companyId);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = sessionCookie ? await verifyToken(sessionCookie) : false;

  // 1. If trying to access login page while already authenticated, redirect to dashboard
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 2. Allow access to login page for unauthenticated users
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // 3. For all protected dashboard routes, redirect unauthenticated users to /login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. User is authenticated, proceed to route
  const response = NextResponse.next();
  if (pathname.startsWith("/invoices/") && pathname.endsWith("/print")) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, svgs, etc.)
     * - api routes that might be public
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
