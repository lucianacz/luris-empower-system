# Luris Empower System

Empower is a private, statement-first personal finance application focused on understanding how money is used: monthly cost of living, spending categories, essential versus flexible expenses, and personal versus household costs. It imports exported financial files, finds duplicates, keeps owned-account transfers out of spending totals, and separates investments from ordinary expenses.

The current MVP is built around the supplied Deel, ARQ, Brubank, Payoneer, and Alpaca formats. Direct banking APIs are intentionally not required.

## Stack

- Next.js 16 App Router with TypeScript
- Tailwind CSS 4
- Supabase PostgreSQL, Auth, Storage, and Row Level Security
- Radix UI accessibility primitives
- Vitest and Testing Library
- Vercel-compatible Node.js route handlers

## What works

- Drag-and-drop CSV, XLSX, and PDF preview
- Multi-file drop with a safe preview-and-confirm queue
- Automatic provider detection with a manual override
- Reusable generic column mapping
- Normalized signed amounts, dates, currencies, statuses, transaction kinds, original amounts, and fees
- Dedicated Deel, ARQ, Brubank, Payoneer, and generic adapters
- Exact-file and transaction-level duplicate protection
- Failed, pending, and reversed transaction retention without affecting totals
- Partial, one-to-many, many-to-one, cross-currency, and multi-step transfer suggestions
- Questions for unresolved incoming movements and cash withdrawals
- Live normalized ledger with category assignment and personal/household splits
- Traceable USD reporting for current month, previous month, year to date, and custom ranges
- Monthly cash-flow and normalized service-month views with completed-month averages
- Click-through totals, charts, categories, merchants, locations, insights, and recurring costs
- Dynamic location suggestions based on repeated evidence, with confirm/reject/edit/merge/split workflows
- Spending-by-location comparisons with full-month averages, partial months, and flights separated
- Proactive recurring-payment, missing-month, double-payment, and uncategorized-merchant questions
- Recurring-expense details with original currency, historical USD value, and covered-month allocations
- Configurable historical ARS methodology and dated exchange-rate provenance
- Partner-ready transaction ownership, payer, beneficiary, split, and reimbursement fields
- Default category suggestions plus reusable exact-merchant rules
- Questions Inbox decisions that update transaction treatment and totals
- Transfer-chain review with confirm/reject actions and per-leg allocations
- Account freshness, statement coverage-gap, and safe-overlap indicators
- Secure original-file storage linked to import history
- Whole-batch rollback
- Separate investment schema, Alpaca statement detection, and manual positions/snapshots

All 37 supplied real files were previewed locally through their production adapters: 14 CSV exports and 23 PDF statements. Provider detection succeeded for Deel, ARQ, Brubank, Payoneer, and Alpaca, including empty ARQ statement months. The originals were not modified, copied into this repository, or committed. See [statement mapping notes](docs/statement-mappings.md), the [2025-to-date coverage audit](docs/coverage-audit-2025-to-date.md), and the [September 13 spending reconciliation](docs/spending-reconciliation-2026-09-13.md).

## Local setup

Requirements:

- Node.js 20.9 or newer
- npm
- A Supabase project
- Supabase CLI if you want to apply migrations from the terminal

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The service-role key is not required for normal imports. Do not expose it to the browser or prefix it with `NEXT_PUBLIC_`.

Apply the schema:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

In Supabase Authentication, enable email sign-in and add these redirect URLs:

```text
http://localhost:3000/auth/callback
https://YOUR_VERCEL_DOMAIN/auth/callback
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`. Statement previews work without Supabase. Confirmation, history, mappings, and rollback require a signed-in Supabase user.

## Database and security

The initial and additive reporting migrations in `supabase/migrations/` create:

- profiles and financial accounts;
- import mappings, batches, and secure file metadata;
- normalized transactions and categories;
- transfer chains with partial allocations;
- Questions Inbox records, expense splits, budgets, and life periods;
- investment accounts, assets, activity, positions, and snapshots;
- locations, currency hints, inferred or confirmed stays, and transaction location evidence;
- people, payers, beneficiaries, reimbursements, merchant profiles, and recurring obligations;
- historical exchange-rate provenance, USD reporting values, and service-month allocations;
- evidence-linked insights and grouped proactive questions;
- a private `statement-files` Storage bucket.

Every user-owned table has Row Level Security enabled. Policies compare `auth.uid()` with the row owner, and statement object paths begin with that user ID. Import routes verify the authenticated user again on the server.

Rollback removes transactions created by the selected batch and marks the batch as rolled back. The original file stays in private storage for audit history.

## Import workflow

1. Open **Imports** and drop one statement or the complete set.
2. Review the detected institution and account currency.
3. If the file is unfamiliar, map its date, description, amount or debit/credit, currency, status, ID, and type columns.
4. Review warnings and normalized rows.
5. Confirm the import after signing in.
6. The app stores the original file, imports only new rows, opens questions for uncertainty, and quietly rebuilds transfer suggestions.
7. Continue through the queue until every selected file is confirmed or safely skipped as a duplicate.

The Spending view then leads with monthly expenses, categories, essential and flexible costs, and personal or household shares. Data coverage remains available below it to flag missing or stale statements.

When a transaction is categorized, matching historical descriptions are categorized at the same time and an exact-match rule is saved for future imports. Ambiguous person-to-person payments remain in the uncategorized queue for review.

The checksum prevents a repeated file from creating another batch. Overlapping exports are still safe because provider IDs and transaction fingerprints catch repeated rows.

## Accounting rules

- Only original client payments count as ordinary income.
- Final purchases, fees, and taxes count as spending.
- Owned-account movements remain visible and are excluded from income and expense totals.
- Transfer fees remain separately measurable even when the principal is excluded.
- Unknown credits do not count as income until resolved.
- Investment purchases and sales do not count as ordinary spending or income.
- Dividends and interest use the separate investment-income treatment.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The committed fixtures are anonymized and preserve only the structural characteristics needed to test the adapters.

The current automated suite covers provider parsing, conservative classification, duplicate keys, statement gaps, cross-currency matching, partial allocations, and multi-step chains. A separate local audit exercised every supplied source file without persisting or copying its contents.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel as a Next.js project.
3. Add the three public environment values from `.env.local` to the Vercel project. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin.
4. Add the production `/auth/callback` URL to Supabase Authentication redirect URLs.
5. Deploy.

The statement preview and commit handlers use the Node.js runtime and set bounded file sizes and execution durations suitable for Vercel. Supabase provides the database and object storage, so no persistent filesystem is assumed.

## Scope and future integrations

CSV/PDF/XLSX upload remains a permanent integration path. Provider APIs are a future option only when they are official, work with the account type, expose the needed transaction or balance data, support secure least-privilege access, require no banking-password storage, and justify their cost and maintenance.

Do not connect undocumented ARQ or Brubank mobile APIs, intercept app traffic, bypass certificate controls, reverse-engineer authentication, or store mobile session tokens.

Detailed investment-statement automation, budgets, life-period reports, cash estimation, and direct provider APIs remain later phases. The schema reserves those concepts now; the stable expense/import workflow does not depend on them.
