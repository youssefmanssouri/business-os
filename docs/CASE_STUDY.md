# BusinessOS — engineering case study

BusinessOS is an independent full-stack project covering CRM, invoicing, bookings and company operations.

[Demo](https://business-os-manssouri.vercel.app) · [Portfolio](https://www.youssefmanssouri.site/projects/businessos) · [Setup](../README.md#run-locally)

## Request flow

~~~mermaid
flowchart LR
    UI[React interface] --> Session[Session and role guards]
    Session --> Actions[Server actions and input validation]
    Actions --> Prisma[Prisma and company-scoped queries]
    Prisma --> Database[(SQLite locally / PostgreSQL hosted)]
~~~

The implementation lives in [auth.ts](../src/lib/auth.ts), [server actions](../src/lib/actions/index.ts) and the [relational schema](../prisma/schema.prisma). The company ID used for data access comes from the verified session.

## What I built

The core workflows connect customers and deals to invoices, services and staff to appointments, and operational records to finance and dashboard summaries. Supporting modules cover tasks, employees, inventory, document metadata and company settings.

The [screenshots](../screenshots/businessos) show the application interface. The local seed script supplies synthetic records for a populated walkthrough.

## Decision: keep company identity on the server

**Challenge:** a caller can submit an ID belonging to another company.

**Implementation:** authenticated actions use the session's company ID when resolving and changing records. Role guards restrict operations to the intended roles. See the [guards](../src/lib/auth.ts), [actions](../src/lib/actions/index.ts) and [cross-company security tests](../tests/verify-security.ts).

**Trade-off:** this is application-level scoping. It depends on each data path applying the correct checks; the schema's foreign keys do not replace those checks.

## Decision: store invoice snapshots

**Challenge:** changing customer details, company details or catalog prices must not silently rewrite invoice history.

**Implementation:** invoice creation persists customer and seller details, currency, tax and item values. The [schema](../prisma/schema.prisma) defines the snapshot fields and the [invoice suite](../tests/verify-invoices.ts) exercises the billing workflow.

**Trade-off:** snapshots duplicate data intentionally. Invoice-edit rules still need to distinguish editable drafts from historical records; snapshot storage alone is not an audit or legal-compliance guarantee.

## Decision: separate local and hosted storage

**Challenge:** contributors need a local database with little setup, while hosted requests need persistent shared storage.

**Implementation:** local development uses SQLite. Hosting can use PostgreSQL. The [sync script](../scripts/sync-database-provider.js) selects the Prisma provider from the process's database URL before generation and build commands.

**Trade-off:** changing the provider edits the schema file, not the contents of the database. Data migration and deployment schema management are separate steps. This project does not implement a replicated SQLite storage service.

## Evidence and current limits

- [14 TypeScript verification suites](../tests) cover authentication, access rules, invoices, bookings and other module workflows. The [runner](../scripts/run-all-tests.js) reports the result of the current run.
- The database schema uses floating-point fields for monetary values. A system handling real payments would need an explicit decimal or minor-unit strategy.
- Document records hold metadata; the presence of this module does not establish a managed file-storage service.
- Bookings include application checks and timezone conversion. This document makes no concurrency or throughput benchmark claim.
- Demo screenshots and seed records are examples, not evidence of customer adoption or production usage.

Use the [README commands](../README.md#verification-commands) to reproduce checks against a disposable local database. Test counts, route counts and passing output change with the source revision, so historical “540/540” and “15/15” claims have been removed.
