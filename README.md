# BusinessOS

BusinessOS is a multi-tenant business operations platform that unifies CRM deal pipelines, itemized billing and invoicing, appointment bookings, operational task boards, inventory tracking, HR directories, and real-time financial telemetry into a single cohesive command center.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-3A171C?style=flat-square&logo=vercel)](https://business-os-manssouri.vercel.app)
[![Case Study](https://img.shields.io/badge/Portfolio-Case%20Study-A65F4B?style=flat-square)](https://www.youssefmanssouri.site/projects/businessos)
[![GitHub Repository](https://img.shields.io/badge/Repository-GitHub-181717?style=flat-square&logo=github)](https://github.com/youssefmanssouri/business-os)
[![Next.js 15](https://img.shields.io/badge/Next.js-15%20App%20Router-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)

---

## 🌐 Links

- **Live Production Application**: [https://business-os-manssouri.vercel.app](https://business-os-manssouri.vercel.app)
- **Portfolio Case Study**: [https://www.youssefmanssouri.site/projects/businessos](https://www.youssefmanssouri.site/projects/businessos)
- **Source Code Repository**: [https://github.com/youssefmanssouri/business-os](https://github.com/youssefmanssouri/business-os)

---

## 📸 Product Preview & Interface Walkthrough

> *The interface uses a dark/light responsive design system built for operational clarity. Below are the key views to capture or reference:*

| Module View | Operational Focus | Suggested Screenshot Asset |
|-------------|-------------------|----------------------------|
| **Executive Dashboard** | Real-time MRR/revenue indicators, receivables, upcoming schedules in local timezone, and revenue velocity charts | ![Executive Dashboard](screenshots/businessos/dashboard.png) |
| **CRM Deal Pipeline** | Multi-stage deal progression (Kanban & Table), lead scoring, customer contact records, and win-rate metrics | ![CRM Deal Pipeline](screenshots/businessos/crm-pipeline.png) |
| **Invoice Builder** | Dynamic line-item calculation, sales tax adjustment, status tracking (Paid, Pending, Overdue), and printable receipts | ![Invoice Builder](screenshots/businessos/invoices.png) |
| **Booking Calendar** | Resource scheduling, staff capacity planning, service interval enforcement, and IANA timezone handling | ![Booking Calendar](screenshots/businessos/bookings.png) |
| **Financial Ledger** | Income vs. expense classification, settled state toggles, and net profit telemetry | ![Financial Ledger](screenshots/businessos/finance.png) |

---

## 🚀 Main Capabilities

1. **Executive Command Dashboard**: Live revenue metrics, pending receivables, appointment schedules in company timezone, audit activity feeds, and weekly revenue velocity charts powered by Recharts.
2. **CRM Deal Pipeline & Client Management**: Multi-stage sales opportunity tracker (Kanban & Table views), contact histories, and deal progression stages (`NEW_LEAD`, `CONTACTED`, `PROPOSAL`, `WON`, `LOST`).
3. **Itemized Billing & Invoice Engine**: Dynamic invoice builder with automatic line-item calculations, tax handling, payment status management (`PAID`, `PENDING`, `OVERDUE`, `DRAFT`), immutable historical snapshots, and printable layout views.
4. **Resource Booking & Appointment Calendar**: Scheduling system with staff capacity allocation, service duration enforcement, and deterministic IANA timezone handling with date-fns-tz.
5. **Team Directory & Role-Based Access (RBAC)**: Employee profiles, department allocations, and role permissions (`ADMIN`, `MANAGER`, `EMPLOYEE`) with server-side validation.
6. **Operational Task Kanban**: Status board (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`) with priority tags (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), assignee linkage, and dynamic shell counter integration.
7. **Inventory & Product Vault**: Product stock tracking, cost vs. price margin visibility, tenant-scoped SKU uniqueness, and low-stock alerts.
8. **Financial Ledger & Cash Flow**: Categorized income and expense records, settled status tracking, and net profit summaries.
9. **Business Intelligence & Analytics**: Relational telemetry computing realized revenue, customer LTV, deal win rate, and inventory value with date range filtering.
10. **Document Repository**: Centralized metadata vault for corporate contracts, financial audits, compliance records, and HR files.
11. **Organization Settings**: Corporate address, tax identification, default currency (`USD`, `EUR`, `GBP`, `CAD`, `MAD`, `JPY`), sales tax rate, and IANA timezone management.

---

## 💡 Technical Highlights

- **Dual-Database Architecture (SQLite + PostgreSQL)**: Zero-configuration local development using SQLite (`file:./dev.db`), with seamless switching to PostgreSQL (e.g. Neon, Supabase, AWS RDS) for production serverless deployments via automatic provider synchronization.
- **Tenant Isolation**: Strict multi-tenant data boundaries enforced on every database query using foreign-key company scoping (`companyId`).
- **Cryptographic Authentication**: Stateless JWT session authentication (`jose`, HS256) stored in HTTP-only, secure, SameSite cookies with strict 32-character production secret validation.
- **Type-Safe Server Mutations**: All mutations run via Next.js Server Actions with strict Zod runtime schema boundaries, email normalization, and typed return structures.
- **Timezone Resilience**: Deterministic IANA timezone arithmetic using `date-fns-tz` to eliminate UTC-offset discrepancies across bookings and invoicing.
- **Comprehensive Test Harness**: 14 standalone verification suites executing against real schema constraints and business logic.

---

## 🛠️ Technology Stack

| Layer | Technology | Functional Role |
|-------|------------|-----------------|
| **Framework** | Next.js 15 (App Router) | Server/client component architecture, server actions, and middleware |
| **Language** | TypeScript 5.7 | End-to-end type safety, entity interfaces, and validation types |
| **ORM & Data Layer** | Prisma ORM 6 | Schema definitions, migrations, relational queries, and cascading deletes |
| **Databases** | PostgreSQL & SQLite | PostgreSQL for production multi-tenant persistence; SQLite for local dev |
| **Styling** | Tailwind CSS 3.4 | Custom responsive command-center UI, glassmorphism, and dark/light tokens |
| **Data Visualization** | Recharts 2.15 | Interactive financial telemetry, revenue velocity, and sales pipeline charts |
| **Validation** | Zod 3.24 | Runtime schema validation for mutations, forms, and server actions |
| **Security & Auth** | Jose 6.2 & Bcryptjs 3.0 | HS256 JWT session tokens, HTTP-only cookies, and salted password hashing |
| **Date & Time** | Date-fns 4.1 & Date-fns-tz 3.2 | IANA timezone conversion, interval calculations, and DST resilience |

---

## 🔒 Architecture & Security Details

```text
Browser Client (React 19 / Tailwind CSS)
               │
               ▼
   Next.js 15 App Router (Server & Client Components)
               │
               ▼
   Next.js Middleware (Session Cookie Verification via Jose)
               │
               ▼
   Server Actions (Zod Validation & requireAuth / requireRole)
               │
               ▼
   Prisma ORM (Tenant-Scoped Data Access Layer)
               │
      ┌────────┴────────┐
      ▼                 ▼
  PostgreSQL          SQLite
 (Production:       (Local Dev:
  Neon / RDS)        dev.db)
```

### Database Strategy: Production vs. Development

| Characteristic | Local Development | Serverless Production (e.g., Vercel) |
|----------------|-------------------|--------------------------------------|
| **Engine** | SQLite | PostgreSQL (e.g., Neon, Supabase, RDS) |
| **Connection URL** | `file:./dev.db` | `postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require` |
| **Provider in `schema.prisma`** | `sqlite` | `postgresql` |
| **Provider Switching** | Automated via `scripts/sync-database-provider.js` based on `DATABASE_URL` protocol | Automated via `scripts/sync-database-provider.js` during build |
| **Persistence Mechanism** | Local disk file (`prisma/dev.db`) | Managed cloud relational database with connection pooling |
| **Why the distinction?** | Fast, zero-dependency onboarding without local Docker or DB installation | Serverless execution environments (AWS Lambda / Vercel) have ephemeral, container-isolated `/tmp` filesystems. SQLite cannot persist user mutations across isolated function containers or cold starts. |

### Authentication & Authorization Flow

1. **Account Registration (`/register`)**:
   - Validates user input via Zod boundary (full name, email format, minimum 8-character password, password confirmation).
   - Normalizes email via trimming and lowercase conversion.
   - Hashes password using Bcrypt with 10 salt rounds (`bcryptjs`).
   - Atomically creates Company tenant and initial User record (`role: "ADMIN"`).
   - Issues a cryptographically signed JWT token (`jose`, HS256) valid for 7 days.
   - Sets secure HTTP-only session cookie (`businessos_session`).
2. **Sign In (`/login`)**:
   - Validates email and password format.
   - Normalizes email to lowercase.
   - Retrieves user record scoped by email.
   - Verifies password using `bcrypt.compare`.
   - Rejects inactive or suspended accounts (`status !== "ACTIVE"`).
   - Issues fresh signed JWT session cookie.
3. **Session Verification & Route Protection**:
   - Next.js `middleware.ts` intercepts all protected routes.
   - Unauthenticated requests to dashboard routes are redirected to `/login` with `callbackUrl`.
   - Authenticated sessions attempting to access `/login` or `/register` are redirected to `/`.
   - Every server action verifies identity via `requireAuth()` and role via `requireRole()`.

---

## 🧪 Testing

The platform includes 14 automated verification suites covering all core workflows:

```bash
npm run test
```

### Verification Suites

| Test Suite | Coverage Focus |
|------------|----------------|
| `tests/verify-auth-flow.ts` | Complete authentication lifecycle: validation, registration, password hashing, duplicate rejection, login, seeded accounts, logout |
| `tests/verify-security.ts` | Multi-tenant isolation, cross-tenant IDOR protection, RBAC permission tiers, password verification |
| `tests/verify-invoices.ts` | Itemized line calculation, tax rates, payment status updates, invoice snapshots |
| `tests/verify-bookings.ts` | Staff capacity allocation, overlapping slot rejection, company timezone conversions |
| `tests/verify-crm.ts` | Deal stage progression, pipeline value totals, customer contact histories |
| `tests/verify-finance.ts` | Revenue vs. expense categorization, settled transaction states, profit telemetry |
| `tests/verify-inventory.ts` | Stock count increments/decrements, SKU uniqueness per tenant, low-stock thresholds |
| `tests/verify-employees.ts` | Staff directory management, department allocations, role assignments |
| `tests/verify-documents.ts` | Metadata tracking, category classification, tenant-scoped access |
| `tests/verify-tasks.ts` | Kanban board column transitions, priority assignments, shell notification count |
| `tests/verify-analytics.ts` | Computed metric aggregations (LTV, win rates, inventory valuation) |
| `tests/verify-cross-module.ts`| End-to-end integration across CRM deals, invoices, and accounting entries |
| `tests/verify-operations.ts` | Multi-step operational workflows and business logic |
| `tests/verify-shell.ts` | Shell state synchronization, navigation badges, and session freshness |

---

## ⚙️ Setup & Development Instructions

### Prerequisites

- Node.js 18.18+ or 20+
- npm or pnpm

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/youssefmanssouri/business-os.git
cd business-os
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
# Database connection string
# Local development (SQLite):
DATABASE_URL="file:./dev.db"

# Production (PostgreSQL):
# DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

# JWT session encryption secret (minimum 32 characters; strictly validated in production)
SESSION_SECRET="your-development-session-secret-key-at-least-32-chars"

# Application environment
NODE_ENV="development"

# Optional UI flag (controls demo badge only)
NEXT_PUBLIC_DEMO_MODE="false"
```

### 3. Initialize Database & Seed Synthetic Data

```bash
# Push schema to local SQLite database
npm run db:push

# Seed default tenants, users, and operational records
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Running the Test Suite

```bash
npm run test
```

### 6. Production Build Verification

```bash
npm run build
```

---

## 📚 Additional Technical Documentation

- **[Detailed Technical Case Study](docs/CASE_STUDY.md)**: Architectural analysis, multi-tenant database design, data integrity enforcement, and performance benchmarks.
- **[Database Provider Sync Script](scripts/sync-database-provider.js)**: Automated utility keeping `prisma/schema.prisma` in sync with the database protocol (`postgresql://` vs `file:`).

---

## 👤 Author

**Youssef Manssouri**
- Portfolio: [https://www.youssefmanssouri.site](https://www.youssefmanssouri.site)
- LinkedIn: [linkedin.com/in/youssef-manssouri-24b4662ba](https://www.linkedin.com/in/youssef-manssouri-24b4662ba/)
- Email: [manssouriyoussef33@gmail.com](mailto:manssouriyoussef33@gmail.com)