# BusinessOS — Product Case Study & Architecture Verification

> **Production Application**: [https://business-os-manssouri.vercel.app](https://business-os-manssouri.vercel.app)  
> **Source Repository**: [https://github.com/youssefmanssouri/business-os](https://github.com/youssefmanssouri/business-os)  
> **Author**: Youssef Manssouri ([https://www.youssefmanssouri.site](https://www.youssefmanssouri.site))  
> **Portfolio Case Study**: [https://www.youssefmanssouri.site/projects/businessos](https://www.youssefmanssouri.site/projects/businessos)  
> **Current Status**: Production Deployed & Verified (540/540 Automated Tests Passing, 15/15 Routes Verified)

---

## 1. Overview

**BusinessOS** is a full-stack, multi-tenant business operations platform engineered for service providers, digital agencies, and B2B consultancies. It consolidates customer relationship management (CRM), itemized billing and invoices, appointment scheduling, operational tasks, employee directories, inventory tracking, financial ledger records, document management, and business intelligence into a unified workspace.

The platform is designed to replace disconnected single-purpose software subscriptions with a cohesive relational system where operational and financial state flows naturally across all business activities.

---

## 2. The Problem

Modern small and mid-sized service businesses typically operate on an expensive, disconnected patchwork of point solutions:
- **CRM & Leads**: HubSpot, Pipedrive, or manual spreadsheets
- **Scheduling**: Calendly, Acuity, or external calendar links
- **Task Management**: Asana, Trello, or Linear
- **Billing & Invoices**: QuickBooks, FreshBooks, or Stripe Invoicing
- **Financial Telemetry**: Disconnected Excel spreadsheets and manual ledger reconciliation

This operational fragmentation introduces serious business friction:
1. **Data Silos**: Customer lifecycle changes in the CRM do not propagate to scheduling, billing, or task assignments.
2. **Subscription Cost Multiplication**: Per-seat fees accumulate across multiple disconnected software providers.
3. **Manual Reconciliation Overhead**: Operations teams spend billable hours cross-checking invoices, appointments, and payments.
4. **Security & Data Boundary Risks**: Business information resides across separate third-party services without centralized tenant isolation or role-based access control.

---

## 3. The Solution

BusinessOS unifies these disjointed operational streams into a single relational command center with multi-tenant boundary isolation. Every core operational entity (`Customer`, `Deal`, `Invoice`, `Appointment`, `Task`, `Product`, `FinanceRecord`, `Document`, `User`) is scoped to a company tenant boundary (`companyId`).

Data moves seamlessly through the business lifecycle:
- Winning a sales opportunity allows issuing an itemized invoice for that customer with a single action.
- Settling an invoice automatically freezes legal accounting snapshots and immediately increments verified revenue in the financial ledger and executive analytics.
- Client appointments are linked to active company staff with deterministic timezone translation and concurrency conflict prevention.
- Operational tasks reflect dynamically in the navigation shell, providing clear visibility into open workstreams.

---

## 4. Core Workflows

The platform supports concrete, interconnected business workflows verified through automated tests and production persistence:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CORE WORKFLOW ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────────┘

1. Revenue & Billing Flow:
   Customer [CRM] ──► Deal [Pipeline] ──► Invoice [Itemized Engine] ──► Payment Settlement ──► Financial Telemetry
   (Generates Lead)    (Advances to WON)   (Snapshots Seller & Client)   (Locks Record)         (Updates Live P&L)

2. Operational Scheduling Flow:
   Customer [Directory] ──► Service Selection ──► Staff Allocation ──► Timezone Conversion ──► Conflict Locking
   (Verifies Active)        (Enforces Duration)   (Checks Tenant)      (Deterministic IANA)    (Prevents Overlaps)

3. Operational Execution Flow:
   Company Initiative ──► Task Kanban ──► Employee Assignment ──► Dynamic Shell Badge
   (Urgent / High / Low)   (TODO → DONE)   (Tenant Verified)       (Open Task Counter)

4. Governance & Telemetry Flow:
   Paid Invoices + Settled Expenses ──► Relational Aggregation ──► Executive Dashboard & BI
   (Zero Mock Fallbacks)                 (Calculates Real LTV/P&L)   (Weekly Revenue Velocity)
```

### Workflow A: Customer Acquisition → Deal Pipeline → Invoicing → Cash Settlement
1. **Lead Generation**: A new customer profile is registered with contact details, status classification, and billing metadata.
2. **Deal Pipeline**: An associated sales opportunity is tracked on the 5-stage CRM Kanban board (`NEW_LEAD` → `CONTACTED` → `PROPOSAL` → `WON` / `LOST`).
3. **Invoice Generation**: When a deal closes, an itemized invoice is generated with dynamic line-item computation, tax rates, and optional discounts.
4. **Historical Snapshots**: The invoice records immutable snapshots of the seller's legal registration/tax ID and customer billing address to guarantee accounting auditability regardless of future profile updates.
5. **Settlement & Telemetry**: Marking the invoice `PAID` locks the record against post-payment modifications, assigns a `paidAt` timestamp, records an audit event in the `ActivityLog`, and immediately updates realized revenue in `/analytics` and `/finance`.

### Workflow B: Customer Scheduling → Resource Allocation → Operations
1. **Service Catalog**: A customer selects an active service with defined duration and pricing.
2. **Staff Assignment**: The appointment is linked to a verified employee within the same company tenant.
3. **Timezone & DST Normalization**: Local appointment times (e.g. 10:00 AM EDT) are deterministically converted to UTC and rendered in the viewer's company timezone using `date-fns-tz`. Spring-forward daylight saving gaps are rejected at the server boundary.
4. **Conflict Defense**: Concurrent scheduling attempts for the same staff member or customer are checked using database transactions, returning `409 Conflict` on overlapping intervals.
5. **Compliance Lock**: Completed appointments are archived to protect historical operational records from retroactive alteration.

### Workflow C: Tasks → Employee Assignment → Global Workstream
1. **Task Assignment**: Tasks are created with priority tags (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), due dates, and assigned to active tenant employees.
2. **Dynamic Shell Badge**: The navigation sidebar queries the company's open tasks (`TODO`, `IN_PROGRESS`, `REVIEW`) via `getShellData`, displaying the active count beside the Tasks navigation item.
3. **Lifecycle Completion**: Transitioning a task to `DONE` immediately decrements the shell counter and records an audit log event.

### Workflow D: Invoices & Expenses → Database-Backed Financial Telemetry
1. **Deterministic Calculations**: Realized revenue is computed strictly from invoices where `status = "PAID"`. Unsettled or pending receivables are tracked separately.
2. **Operating Expenses**: The financial ledger categorizes operational expenses (Payroll, Cloud Infrastructure, Software Tooling).
3. **Authoritative KPIs**: The `/analytics` engine computes Net Profit, Customer Lifetime Value (LTV), Deal Win Rate, and Inventory Valuation directly from database rows without synthetic data fallbacks.

---

## 5. Key Product Capabilities

BusinessOS consists of 11 cohesive operational modules:

1. **Executive Command Dashboard (`/`)**: Displays all-time realized revenue, pending receivables, upcoming appointments formatted in company timezone, client accounts, a 7-day revenue velocity chart with Recharts, and a live audit activity feed.
2. **CRM & Lead Pipeline (`/crm`)**: Dual-view sales opportunity management (interactive Kanban board and structured table), customer detail drawers, contact logs, and deal stage progression.
3. **Itemized Billing & Invoicing (`/invoices`)**: Invoice builder with automatic subtotal, tax, and discount calculations, status lifecycle management (`DRAFT`, `PENDING`, `OVERDUE`, `PAID`), and dedicated printable invoice layouts (`/invoices/[id]/print`).
4. **Resource Bookings & Calendar (`/bookings`)**: Scheduling engine supporting multiple services, staff assignment, duration enforcement, conflict detection, and timezone conversion.
5. **Team Directory & Employees (`/employees`)**: Internal employee profiles, department allocation, job titles, and status management (`ACTIVE`, `ON_LEAVE`, `INACTIVE`) with sensitive field stripping.
6. **Operational Task Board (`/tasks`)**: Linear-style Kanban board organized by status (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`), priority filters, tags, assignee linkage, and dynamic shell counter integration.
7. **Inventory & Product Vault (`/inventory`)**: Stock level management, SKU uniqueness scoped to company tenant, cost vs. retail price margin tracking, and low-stock threshold alerts.
8. **Financial Ledger & Cash Flow (`/finance`)**: Income and expense tracking, transaction categorization, settled vs. pending status management, and gross vs. net profit summaries.
9. **Business Intelligence & Analytics (`/analytics`)**: Relational analytics computing realized revenue, operating expenses, net profit, customer LTV, deal conversion rates, inventory valuation, and category breakdowns with date filtering (`30D`, `90D`, `YTD`).
10. **Document Metadata Vault (`/documents`)**: Centralized repository for contracts, compliance certifications, financial audits, and HR documents with category filtering and uploader permissions.
11. **Organization Settings & RBAC (`/settings`)**: Company profile management, corporate address, tax identification numbers, default currency selection (USD, EUR, GBP, CAD, MAD, JPY), sales tax rates, and IANA timezone configuration.

---

## 6. Architecture

```text
Browser Client (React 19 / Tailwind CSS)
               │
               ▼
   Next.js 15 App Router (Server & Client Components)
               │
               ▼
   Server Actions & Route Handlers (Zod Runtime Validation)
               │
               ▼
   Prisma ORM (Data Access Layer & Type Safety)
               │
               ▼
   SQLite (Serverless Replicated) / PostgreSQL Schema
```

### Technology Stack & Engineering Purpose

| Technology | Role & Purpose |
|---|---|
| **Next.js 15 (App Router)** | Server Components for efficient server-side data fetching; Server Actions for atomic, type-safe mutations without external API boilerplate. |
| **React 19** | Modern client component rendering, hooks, and UI state transitions. |
| **TypeScript 5.7** | Strict static type checking spanning database entities, server action payloads, and user interface components. |
| **Prisma ORM 6.3** | Relational schema definitions, foreign key constraints (`RESTRICT`, `CASCADE`), and type-safe database access. |
| **Database Architecture** | Uses Prisma ORM with SQLite for local development and self-contained serverless deployment (with automated replica synchronization in serverless runtimes), architected with a relational schema portable to PostgreSQL. |
| **Security & Auth** | `jose` (JWT) for signed, HTTP-only session cookies paired with `bcryptjs` (10-round salted password hashing). |
| **Validation** | Zod (v3.24) runtime boundary validation for all action inputs, rejecting malformed emails, negative prices, and invalid enums. |
| **Date & Timezone** | `date-fns` and `date-fns-tz` for deterministic IANA timezone arithmetic, DST protection, and wall-clock to UTC translation. |
| **Visualization** | Recharts (v2.15) for accessible, responsive vector charts rendering revenue velocity and financial breakdowns. |
| **Styling** | Tailwind CSS with `next-themes` supporting dark and light theme switching. |

---

## 7. Security & Multi-Tenancy

BusinessOS implements defense-in-depth security principles:

```text
Client Browser (Encrypted HTTPS)
       │
       ▼ [Secure, SameSite, HTTP-Only Cookie: "businessos_session"]
Next.js Middleware & Route Protection
       │
       ▼ [JWT Signature Verification via jose & Fail-Fast Secret Check]
Server Action Boundary
       │ ├── 1. Session Authenticity Check (UserId, CompanyId, Role)
       │ ├── 2. Zod Runtime Schema Validation (Type, Range, Enum Guards)
       │ ├── 3. Role-Based Access Control (ADMIN / MANAGER / EMPLOYEE)
       │ └── 4. Insecure Direct Object Reference (IDOR) Defense
       ▼
Prisma ORM Data Access Layer
       │ ── Mandatory `where: { companyId }` Scoping on every query & mutation
       ▼
Relational Database Engine
```

### A. Multi-Tenant Isolation & IDOR Defense
Every business record contains a `companyId` foreign key referencing the `Company` tenant. In all Server Actions, data queries and mutations enforce `where: { id, companyId: session.companyId }`. Foreign tenant IDs cannot be accessed, read, modified, or linked across boundaries:
- A user in Tenant A cannot query or associate a Customer, Service, Staff member, Product, or Invoice belonging to Tenant B.
- Cross-tenant requests fail-safe with `404 Not Found` or `403 Forbidden`.

### B. Role-Based Access Control (RBAC)
Three distinct authorization tiers are enforced server-side:
- **ADMIN**: Complete management over company configuration, tax and currency defaults, user roles, document deletion, and invoice settlement.
- **MANAGER**: Operational access to CRM opportunities, customer directory, invoice creation, appointment booking, and team tasks. Restricted from modifying company settings or promoting users to Admin.
- **EMPLOYEE**: Access to the team directory, assigned tasks, and scheduled appointments; ability to update task progress and upload documents. Strictly restricted from financial modifications, invoice adjustments, or deleting corporate records.

### C. Fail-Fast Production Configuration
In production environments (`NODE_ENV === "production"`):
- The `SESSION_SECRET` must be set to a cryptographically strong string of at least 32 characters.
- Default development keys and short strings cause an immediate fail-fast server exception on startup, preventing insecure deployments.
- Session cookies are strictly configured with `httpOnly: true`, `secure: true`, and `sameSite: "lax"`.

### D. Audit Logging
High-impact operations (invoice creation, deal stage changes, appointments, task completions, and employee role updates) write immutable records to the `ActivityLog` table, recording the action, category, description, and authenticated actor name.

---

## 8. Engineering Challenges

### 1. Insecure Direct Object Reference (IDOR) in Relational Multi-Tenancy
- **Challenge**: In a relational schema with 10+ interlinked models, standard queries like `prisma.appointment.findUnique({ where: { id } })` allow users to inspect foreign records if an ID is guessed.
- **Solution**: Established a strict query convention that compounds `{ id, companyId }` in all `findFirst`, `updateMany`, and `deleteMany` operations. In creation actions, foreign entity references (e.g. `customerId`, `serviceId`, `staffId`) are validated against the session tenant before linking.

### 2. Historical Accounting Immutability
- **Challenge**: If a client updates their corporate name or an organization modifies its default tax rate from 10% to 15%, previously issued invoices would retroactively alter their displayed totals or legal entity details if rendered via dynamic relations.
- **Solution**: Implemented an immutable financial snapshot architecture. When an invoice is created, snapshots of the seller's legal name, tax ID, registration number, address, and client details are frozen into dedicated columns (`customerNameSnapshot`, `sellerTaxIdSnapshot`, `taxRate`, `currency`). In addition, paid invoices are locked with HTTP 409 defenses preventing post-settlement modifications.

### 3. Distributed Timezone & Daylight Saving Time (DST) Handling
- **Challenge**: Standardizing appointments across clients and staff in different global regions often leads to off-by-one calendar day shifts when converting to UTC, or silent failures during annual daylight saving time transitions.
- **Solution**: Integrated `date-fns-tz` with strict IANA timezone parsing. Wall-clock dates (e.g., `2026-08-07 14:00` in `America/New_York`) are deterministically parsed against the company's registered timezone before persisting as UTC timestamps. A dedicated validation step rejects non-existent local times that fall into the 1-hour spring-forward gap.

### 4. Database-Backed Analytics Without Mock Data
- **Challenge**: Business dashboards often rely on hardcoded arrays or synthetic mathematical formulas (e.g., `revenue = (month + 1) * 2400`) to display charts, misrepresenting real production capability.
- **Solution**: Built an analytics engine (`getAnalyticsData`) that performs real relational aggregations across paid invoices, settled finance records, closed CRM deals, active customers, and inventory valuations, complete with strict tenant isolation and dynamic date range filtering (`30D`, `90D`, `YTD`).

---

## 9. Testing & Verification

BusinessOS is backed by an automated verification suite consisting of **540 tests across 13 dedicated test suites**:

| Test Suite | Focus Area | Passing Tests |
|---|---|---|
| `verify-security.ts` | Passwords, JWT sessions, IDOR prevention, RBAC, and Zod boundaries | 18 / 18 PASS |
| `verify-operations.ts` | Production secret fail-fast, settings validation, referential integrity | 44 / 44 PASS |
| `verify-invoices.ts` | Monetary precision, snapshot immutability, invoice lifecycle locking | 137 / 137 PASS |
| `verify-bookings.ts` | Timezones, DST transitions, conflict detection, service RBAC | 76 / 76 PASS |
| `verify-tasks.ts` | Persistence, status transitions, shell task badge synchronization | 49 / 49 PASS |
| `verify-crm.ts` | Customer CRUD, deal stages, Kanban integrity, lead filtering | 31 / 31 PASS |
| `verify-inventory.ts` | SKU uniqueness, stock thresholds, CRUD mutations, catalog RBAC | 42 / 42 PASS |
| `verify-employees.ts` | Directory, sensitive field stripping, status transitions, RBAC | 42 / 42 PASS |
| `verify-finance.ts` | Ledger entries, gross revenue, expense deductions, tax calculations | 38 / 38 PASS |
| `verify-documents.ts` | Metadata vault, category filtering, uploader permissions, IDOR defense | 32 / 32 PASS |
| `verify-analytics.ts` | BI metrics, realized revenue aggregation, LTV, zero-leak isolation | 28 / 28 PASS |
| `verify-shell.ts` | Identity rendering, company name resolution, notification scoping | 23 / 23 PASS |
| `verify-cross-module.ts` | End-to-end integration across all 11 modules in unified workflows | 20 / 20 PASS |
| **TOTAL** | **Comprehensive Automated Verification** | **540 / 540 PASS** |

### Build & Compilation Metrics
- **TypeScript (`npx tsc --noEmit`)**: Clean exit (0 errors).
- **Next.js Production Build (`npm run build`)**: 15/15 routes compiled with zero build warnings.
- **Route Inventory**:
  - `/` (Executive Dashboard)
  - `/crm` (CRM Opportunity Pipeline)
  - `/invoices` (Invoicing & Itemized Builder)
  - `/invoices/[id]` (Invoice Preview)
  - `/invoices/[id]/print` (Printable Invoice Layout)
  - `/bookings` (Appointment Calendar & Scheduling)
  - `/employees` (Team Directory & Organization Profiles)
  - `/tasks` (Operational Task Board)
  - `/inventory` (Stock & Product Vault)
  - `/finance` (Cash Flow & General Ledger)
  - `/analytics` (Executive Telemetry & BI)
  - `/documents` (Corporate Document Repository)
  - `/settings` (Organization Configuration)
  - `/login` (Authentication Gateway)
  - Dynamic API & Server Action routes

---

## 10. Production Deployment

- **Production URL**: [https://business-os-manssouri.vercel.app](https://business-os-manssouri.vercel.app)
- **Deployment Platform**: Vercel (Edge-optimized Serverless runtime)
- **Database Engine**: Persistent relational SQLite database with serverless replication to `/tmp` on cold starts, maintaining persistence and tenant isolation across user sessions.
- **Environment Security**: Enforces HTTPS, secure session cookies, strict CORS, and security response headers.

---

## 11. Live Demo

The live production deployment offers a controlled demonstration experience designed for prospective clients, technical recruiters, and system evaluators:

1. **Controlled Demo Login**:
   - The login page at [https://business-os-manssouri.vercel.app/login](https://business-os-manssouri.vercel.app/login) features convenient 1-click test tenant selectors for **Acme Cloud Technologies** (Admin role) and **Apex Global Dynamics** (Manager role).
   - This allows reviewers to immediately verify multi-tenant isolation and role-based permissions without requiring manual account registration.

2. **Lead to Payment Flow**:
   - Open **CRM & Leads** (`/crm`) to advance an opportunity to `WON`.
   - Open **Invoices** (`/invoices`) to issue a line-item invoice for that client.
   - Inspect the printable invoice view (`/invoices/[id]/print`).
   - Mark the invoice as `PAID` and observe the revenue telemetry update on the **Dashboard** (`/`).

3. **Scheduling & Conflict Detection**:
   - Open **Bookings** (`/bookings`) and schedule an appointment.
   - Attempt to book an overlapping session for the same staff member to verify the conflict prevention defense.

4. **Task Management & Dynamic Navigation**:
   - Open **Tasks** (`/tasks`) and note the dynamic numeric counter badge in the navigation sidebar.
   - Drag an open task to `DONE` to see the badge decrement.

---

## Outcome

BusinessOS is deployed as an active, production business operations platform. It demonstrates clean software architecture, multi-tenant security boundaries, relational data consistency, and verifiable operational utility.
