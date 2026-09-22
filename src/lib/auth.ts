import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE_NAME = "businessos_session";

export interface SessionPayload {
  userId: string;
  companyId: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  email: string;
  name: string;
}

const DEFAULT_SECRET = "businessos_super_secure_development_secret_key_2026_x89f!";

export function getSecretKey(): Uint8Array {
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

/**
 * Generate a signed JWT session token valid for 7 days
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secretKey = getSecretKey();
  return new SignJWT({
    userId: payload.userId,
    companyId: payload.companyId,
    role: payload.role,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("businessos")
    .setAudience("businessos-users")
    .setExpirationTime("7d")
    .sign(secretKey);
}

/**
 * Verify a signed JWT session token (Edge and Node runtime compatible)
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: "businessos",
      audience: "businessos-users",
    });

    if (
      typeof payload.userId !== "string" ||
      typeof payload.companyId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role as SessionPayload["role"],
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

/**
 * Sets the session cookie using secure HTTP-only headers
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clears the session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

let testSessionOverride: SessionPayload | null = null;

/**
 * Sets a test session override for automated integration testing outside HTTP context.
 * Strictly disabled in production.
 */
export function setTestSession(session: SessionPayload | null): void {
  if (process.env.NODE_ENV !== "production") {
    testSessionOverride = session;
  }
}

/**
 * Retrieve the current authenticated user from session cookie (Server Actions & Server Components)
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  if (testSessionOverride && process.env.NODE_ENV !== "production") {
    return testSessionOverride;
  }
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) return null;

    return await verifySessionToken(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Enforce authentication on a server operation. Throws a standardized Unauthorized error if unauthenticated.
 */
export async function requireAuth(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("Authentication required. Please sign in to access this resource.");
    (error as any).status = 401;
    (error as any).code = "UNAUTHORIZED";
    throw error;
  }
  return user;
}

/**
 * Enforce role-based access control. Throws a Forbidden error if user does not hold an allowed role.
 */
export async function requireRole(allowedRoles: ("ADMIN" | "MANAGER" | "EMPLOYEE")[]): Promise<SessionPayload> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    const error = new Error(`Forbidden: Role '${user.role}' lacks permission for this operation.`);
    (error as any).status = 403;
    (error as any).code = "FORBIDDEN";
    throw error;
  }
  return user;
}

/**
 * Password hashing utility
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Password verification utility
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
