# Security Policy

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately via **GitHub Security Advisories** on this repository (`https://github.com/youssefmanssouri/business-os/security/advisories/new`). Do not open public issues for security disclosures.

## Security Controls

- **Multi-Tenant Isolation:** Authenticated server actions derive `companyId` strictly from the verified JWT session (`jose`), never from client-supplied tenant identifiers.
- **Fail-Closed Session Secrets:** Production (`NODE_ENV=production`) requires an explicit `SESSION_SECRET` of at least 32 characters and refuses default development secrets.
- **Role-Based Access Control:** Operations enforce `requireAuth()` and `requireRole()` server-side (`ADMIN`, `MANAGER`, `EMPLOYEE`).
- **Response Hardening:** `next.config.ts` enforces `CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `no-store` cache controls on printable invoice routes.
