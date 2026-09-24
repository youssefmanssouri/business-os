# BusinessOS — SaaS Business Operations Platform

> **Full-Stack SaaS Business Operations Platform** combining CRM, itemized invoicing, appointment bookings, HR directory, and financial telemetry into a unified workspace.
>
> Designed & Developed by **[Youssef Manssouri](https://www.youssefmanssouri.site)**.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-3A171C?style=flat-square&logo=vercel)](https://business-os-manssouri.vercel.app)
[![Case Study](https://img.shields.io/badge/Portfolio-Case%20Study-A65F4B?style=flat-square)](https://www.youssefmanssouri.site/projects/businessos)
[![Next.js 15](https://img.shields.io/badge/Next.js-15%20App%20Router-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)

---

## 🌐 Live Access & Product Case Study

- **Live Product Demo**: [https://business-os-manssouri.vercel.app](https://business-os-manssouri.vercel.app)
- **Portfolio Case Study**: [https://www.youssefmanssouri.site/projects/businessos](https://www.youssefmanssouri.site/projects/businessos)
- **Detailed Technical Case Study**: [docs/CASE_STUDY.md](docs/CASE_STUDY.md)
- *Production Deployment: Fully persistent, database-backed multi-tenant SaaS workspace with tenant isolation, verified RBAC, and 540/540 automated tests passing.*

---

## 📋 Overview

Small and growing businesses frequently operate across a fragmented stack of disconnected tools: one SaaS for leads, another for invoicing, external calendars for bookings, and spreadsheets for finance. This fragmentation inflates software subscription costs, creates data silos, and wastes valuable operational hours.

**BusinessOS** consolidates these disjointed workflows into a single, cohesive command center with relational data consistency and role-based access control.

---

## 🚀 Core Capabilities

1. **Executive Command Dashboard**: Live revenue metrics, pending receivables, appointment schedules, real-time activity feeds, and weekly revenue velocity charts with Recharts.
2. **CRM Deal Pipeline & Client Directory**: Multi-stage sales opportunity tracker (Kanban & Table views), contact histories, and deal progression stages.
3. **Itemized Billing & Invoice Engine**: Dynamic invoice builder with automatic line-item calculations, tax handling, payment status management (Paid, Pending, Overdue), and printable layout previews.
4. **Resource Booking & Appointment Calendar**: Interactive scheduling system with staff capacity planning, service duration settings, and calendar views.
5. **Team Directory & Role-Based Access (RBAC)**: Employee profiles, department allocations, and granular role permissions (Admin, Manager, Staff).
6. **Financial Ledger & Cash Flow**: Income vs. expense logs, profit & loss summaries, and visual telemetry.

---

## 🏗️ Architecture

```text
Browser Client (React 19 / Tailwind CSS)
               │
               ▼
   Next.js 15 App Router (Server & Client Components)
               │
               ▼
   Server Actions & Route Handlers (Zod Validation)
               │
               ▼
   Prisma ORM (Data Access Layer & Type Safety)
               │
               ▼
   PostgreSQL / SQLite (Relational Database Schema)
```

---

## 🛠️ Technology Stack & Functional Purpose

| Technology | Functional Purpose |
|------------|-------------------|
| **Next.js 15 (App Router)** | Full-stack server/client component architecture and optimized routing |
| **TypeScript 5.7** | Strict type definitions for business entities, state mutations, and forms |
| **PostgreSQL & Prisma ORM** | Relational schema with cascading integrity constraints and typed queries |
| **Tailwind CSS** | Custom responsive command-center interface and unified token system |
| **Recharts** | Interactive financial trends, pipeline metrics, and telemetry charts |
| **Zod** | Runtime schema validation for mutations and server inputs |

---

## 📦 What Was Built (Build Scope)

- Multi-module business operations architecture (CRM, Invoicing, Bookings, HR, Cash Flow)
- Relational database schema with 10+ interrelated models using Prisma ORM
- Interactive financial telemetry & cash flow visualization with Recharts
- Role-based access control (Admin, Manager, Staff) with server-side validation
- Protected interactive sandbox with simulated enterprise data and mutation guards
- Fully responsive interface optimized across mobile, tablet, and desktop viewports

---

## ⚙️ Local Development Setup

### 1. Clone & Install

```bash
git clone https://github.com/youssefmanssouri/business-os.git
cd business-os
npm install
```

### 2. Configure Environment

Create a .env file based on .env.example:

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="your-development-session-secret-key-at-least-32-chars"
NODE_ENV="development"
NEXT_PUBLIC_DEMO_MODE="false"
```

> **Note on Environment Variables:**
> - `DATABASE_URL`: Connection string for SQLite (`file:./dev.db`) or PostgreSQL.
> - `SESSION_SECRET`: Signing secret for JWT sessions (minimum 32 characters; strictly required and validated in production).
> - `NODE_ENV`: Set to `production` in live environments to enforce HTTPS secure cookies and strict secret checks.
> - `NEXT_PUBLIC_DEMO_MODE`: Optional UI flag (set to `"true"` only if displaying the demo indicator badge; does not alter server-side authorization).

### 3. Initialize Database & Seed Synthetic Data

```bash
npx prisma db push
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👤 Author

**Youssef Manssouri**
- Portfolio: [https://www.youssefmanssouri.site](https://www.youssefmanssouri.site)
- LinkedIn: [linkedin.com/in/youssef-manssouri-24b4662ba](https://www.linkedin.com/in/youssef-manssouri-24b4662ba/)
- Email: [manssouriyoussef33@gmail.com](mailto:manssouriyoussef33@gmail.com)